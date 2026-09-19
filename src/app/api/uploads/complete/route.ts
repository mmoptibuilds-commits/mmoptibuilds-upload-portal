import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationEvents, uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { inspectDriveFile } from "@/lib/drive";
import { sendCompletionEmail } from "@/lib/email";
import type { NotificationStatus } from "@/lib/types";
import { z } from "zod";

const schema = z.object({ fileId: z.string().uuid(), driveFileId: z.string().min(1).max(255) });

async function deliverCompletionNotification(input: { batchId: string; username: string; fileCount: number; totalBytes: number; completedAt: Date; driveUrl: string }): Promise<NotificationStatus> {
  return db().transaction(async (tx) => {
    // Serialize retries so two Vercel instances cannot send at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${input.batchId}`}))`);
    const batch = (await tx.select({ notificationStatus: uploadBatches.notificationStatus }).from(uploadBatches).where(eq(uploadBatches.id, input.batchId)).limit(1))[0];
    if (!batch) return "failed";
    if (batch.notificationStatus === "sent" || batch.notificationStatus === "not_configured") return batch.notificationStatus;
    let notificationStatus: NotificationStatus = "not_configured";
    let error: string | undefined;
    try {
      notificationStatus = await sendCompletionEmail(input);
    } catch (caught) {
      notificationStatus = "failed";
      error = caught instanceof Error ? caught.message : "Unknown email error";
    }
    try { await tx.insert(notificationEvents).values({ batchId: input.batchId, status: notificationStatus, error }); } catch { /* delivery state is still persisted below */ }
    await tx.update(uploadBatches).set({ notificationStatus }).where(eq(uploadBatches.id, input.batchId));
    return notificationStatus;
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "The upload completion data is invalid." }, { status: 400 });
    const file = (await db().select({ file: uploadFiles, batch: uploadBatches }).from(uploadFiles).innerJoin(uploadBatches, eq(uploadFiles.batchId, uploadBatches.id)).where(and(eq(uploadFiles.id, parsed.data.fileId), eq(uploadBatches.userId, user.id))).limit(1))[0];
    if (!file) return NextResponse.json({ error: "Upload file not found." }, { status: 404 });
    const driveUrl = `https://drive.google.com/drive/folders/${file.batch.driveFolderId}`;
    if (file.batch.status === "completed") {
      const notificationStatus = await deliverCompletionNotification({ batchId: file.batch.id, username: user.username, fileCount: file.batch.fileCount, totalBytes: file.batch.totalBytes, completedAt: file.batch.completedAt ?? new Date(), driveUrl });
      return NextResponse.json({ ok: true, batchComplete: true, notificationStatus });
    }
    let verifiedDriveFileId: string | undefined;
    if (file.file.status !== "completed") {
      // Never trust a browser supplied Drive id alone: validate hierarchy and immutable metadata.
      const driveFile = await inspectDriveFile(parsed.data.driveFileId);
      const driveSize = driveFile.size === undefined && file.file.size === 0 ? 0 : Number(driveFile.size);
      const expectedMime = file.file.mimeType || "application/octet-stream";
      if (!driveFile.parents?.includes(file.file.driveParentId) || driveFile.name !== file.file.fileName || !Number.isSafeInteger(driveSize) || driveSize !== file.file.size || (expectedMime !== "application/octet-stream" && driveFile.mimeType && driveFile.mimeType !== expectedMime)) return NextResponse.json({ error: "Drive could not verify the uploaded file in this batch." }, { status: 502 });
      verifiedDriveFileId = driveFile.id;
    } else if (file.file.driveFileId !== parsed.data.driveFileId) {
      return NextResponse.json({ error: "This upload file was already finalized with a different Drive object." }, { status: 409 });
    }
    const completion = await db().transaction(async (tx) => {
      // One batch can receive several concurrent completion requests. Keep the
      // file update, count check, and batch transition in one transaction so a
      // batch cannot be marked complete from a stale count.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`batch:${file.batch.id}`}))`);
      if (verifiedDriveFileId) {
        // This update is intentionally conditional so a safe retry can never
        // move a completed row backwards.
        await tx.update(uploadFiles).set({ status: "completed", completedBytes: file.file.size, driveFileId: verifiedDriveFileId, resumableSessionUrl: null, completedAt: new Date() }).where(and(eq(uploadFiles.id, file.file.id), ne(uploadFiles.status, "completed")));
      }
      const currentFile = (await tx.select({ status: uploadFiles.status, driveFileId: uploadFiles.driveFileId }).from(uploadFiles).where(eq(uploadFiles.id, file.file.id)).limit(1))[0];
      if (!currentFile) return { kind: "missing" as const };
      if (currentFile.status === "completed" && currentFile.driveFileId && currentFile.driveFileId !== parsed.data.driveFileId) return { kind: "conflict" as const };
      const counts = (await tx.select({ total: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${uploadFiles.status} = 'completed')::int` }).from(uploadFiles).where(eq(uploadFiles.batchId, file.batch.id)))[0];
      if (!counts || counts.total !== file.batch.fileCount || counts.completed !== file.batch.fileCount) return { kind: "partial" as const };
      const completedAt = new Date();
      const transitioned = (await tx.update(uploadBatches).set({ status: "completed", completedBytes: file.batch.totalBytes, completedAt }).where(and(eq(uploadBatches.id, file.batch.id), ne(uploadBatches.status, "completed"))).returning({ id: uploadBatches.id }))[0];
      return transitioned ? { kind: "transitioned" as const, completedAt } : { kind: "already-complete" as const };
    });
    if (completion.kind === "conflict") return NextResponse.json({ error: "This upload file was already finalized with a different Drive object." }, { status: 409 });
    if (completion.kind === "missing") return NextResponse.json({ error: "Upload file not found." }, { status: 404 });
    if (completion.kind === "partial") return NextResponse.json({ ok: true, batchComplete: false });
    if (completion.kind === "already-complete") {
      const notificationStatus = await deliverCompletionNotification({ batchId: file.batch.id, username: user.username, fileCount: file.batch.fileCount, totalBytes: file.batch.totalBytes, completedAt: file.batch.completedAt ?? new Date(), driveUrl });
      return NextResponse.json({ ok: true, batchComplete: true, notificationStatus });
    }
    const completedAt = completion.completedAt;
    const notificationStatus = await deliverCompletionNotification({ batchId: file.batch.id, username: user.username, fileCount: file.batch.fileCount, totalBytes: file.batch.totalBytes, completedAt, driveUrl });
    return NextResponse.json({ ok: true, batchComplete: true, notificationStatus });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The uploaded file could not be finalized. It may still be in Drive; retry safely." }, { status: 502 });
  }
}
