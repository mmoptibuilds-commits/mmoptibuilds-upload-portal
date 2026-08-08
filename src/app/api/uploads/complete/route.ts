import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationEvents, uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { inspectDriveFile } from "@/lib/drive";
import { sendCompletionEmail } from "@/lib/email";
import { z } from "zod";

const schema = z.object({ fileId: z.string().uuid(), driveFileId: z.string().min(1).max(255) });
export async function POST(request: Request) {
  try {
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "The upload completion data is invalid." }, { status: 400 });
    const file = (await db().select({ file: uploadFiles, batch: uploadBatches }).from(uploadFiles).innerJoin(uploadBatches, eq(uploadFiles.batchId, uploadBatches.id)).where(and(eq(uploadFiles.id, parsed.data.fileId), eq(uploadBatches.userId, user.id))).limit(1))[0];
    if (!file) return NextResponse.json({ error: "Upload file not found." }, { status: 404 });
    // Never trust a browser supplied Drive id alone: validate that it is in this batch hierarchy.
    const driveFile = await inspectDriveFile(parsed.data.driveFileId);
    if (!driveFile.parents?.includes(file.file.driveParentId) || driveFile.name !== file.file.fileName) return NextResponse.json({ error: "Drive could not verify the uploaded file in this batch." }, { status: 502 });
    await db().update(uploadFiles).set({ status: "completed", completedBytes: file.file.size, driveFileId: driveFile.id, resumableSessionUrl: null, completedAt: new Date() }).where(eq(uploadFiles.id, file.file.id));
    const remaining = await db().select({ count: sql<number>`count(*)::int` }).from(uploadFiles).where(and(eq(uploadFiles.batchId, file.batch.id), sql`${uploadFiles.status} <> 'completed'`));
    if (remaining[0].count > 0) return NextResponse.json({ ok: true, batchComplete: false });
    const completedAt = new Date();
    await db().update(uploadBatches).set({ status: "completed", completedBytes: file.batch.totalBytes, completedAt }).where(eq(uploadBatches.id, file.batch.id));
    const url = `https://drive.google.com/drive/folders/${file.batch.driveFolderId}`;
    let notificationStatus: "sent" | "failed" | "not_configured" = "not_configured";
    try { notificationStatus = (await sendCompletionEmail({ username: user.username, batchId: file.batch.id, fileCount: file.batch.fileCount, totalBytes: file.batch.totalBytes, completedAt, driveUrl: url })) as "sent" | "failed" | "not_configured"; }
    catch (error) { notificationStatus = "failed"; await db().insert(notificationEvents).values({ batchId: file.batch.id, status: "failed", error: error instanceof Error ? error.message : "Unknown email error" }); }
    await db().update(uploadBatches).set({ notificationStatus }).where(eq(uploadBatches.id, file.batch.id));
    return NextResponse.json({ ok: true, batchComplete: true, notificationStatus });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The uploaded file could not be finalized. It may still be in Drive; retry safely." }, { status: 502 });
  }
}
