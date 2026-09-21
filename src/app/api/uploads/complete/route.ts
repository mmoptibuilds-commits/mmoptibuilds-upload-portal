import { NextResponse } from "next/server";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notificationEvents, uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { sendCompletionEmail } from "@/lib/email";
import { isSameOriginRequest } from "@/lib/security";
import { verifyStorageObject } from "@/lib/storage";
import {
  buildNotificationEventUpdate,
  createUploadCompletionOrchestrator,
  decideNotificationClaimForTransaction,
  decideUploadCompletionTransaction,
  NOTIFICATION_CLAIM_TTL_MS,
  mapUploadCompletionResult,
  parseUploadCompletionRequest,
  UploadCompletionError,
  type StorageObjectVerification,
  type UploadCompletionSnapshot,
} from "@/lib/upload-completion";
import type { CompletionNotificationInput, NotificationStatus } from "@/lib/types";

async function deliverCompletionNotification(input: CompletionNotificationInput): Promise<NotificationStatus> {
  const claim = await db().transaction(async (tx) => {
    // Serialize retries so two Vercel instances cannot send at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${input.batchId}`}))`);
    const batch = (await tx.select({ notificationStatus: uploadBatches.notificationStatus }).from(uploadBatches).where(eq(uploadBatches.id, input.batchId)).limit(1))[0];
    if (!batch) return { kind: "skip" as const, status: "failed" as NotificationStatus };
    const now = new Date();
    const claimDecision = await decideNotificationClaimForTransaction({
      notificationStatus: batch.notificationStatus,
      now,
      ttlMs: NOTIFICATION_CLAIM_TTL_MS,
    }, async () => {
      const activeClaim = (await tx
        .select({ createdAt: notificationEvents.createdAt })
        .from(notificationEvents)
        .where(and(eq(notificationEvents.batchId, input.batchId), eq(notificationEvents.status, "pending"), gt(notificationEvents.createdAt, new Date(now.getTime() - NOTIFICATION_CLAIM_TTL_MS))))
        .limit(1))[0];
      return activeClaim?.createdAt ?? null;
    });
    if (claimDecision.kind === "skip") return claimDecision;
    const event = (await tx.insert(notificationEvents).values({ batchId: input.batchId, status: "pending" }).returning({ id: notificationEvents.id }))[0];
    await tx.update(uploadBatches).set({ notificationStatus: "pending" }).where(eq(uploadBatches.id, input.batchId));
    return { kind: "claim" as const, eventId: event.id };
  });
  if (claim.kind === "skip") return claim.status;

  let notificationStatus: NotificationStatus = "not_configured";
  let providerError: unknown;
  try {
    // SMTP delivery deliberately runs after the claim transaction has ended.
    notificationStatus = await sendCompletionEmail(input);
  } catch (caught) {
    notificationStatus = "failed";
    providerError = caught;
  }

  await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notification:${input.batchId}`}))`);
    await tx.update(notificationEvents).set(buildNotificationEventUpdate(notificationStatus, providerError)).where(eq(notificationEvents.id, claim.eventId));
    await tx.update(uploadBatches).set({ notificationStatus }).where(eq(uploadBatches.id, input.batchId));
  });
  return notificationStatus;
}

async function loadOwnedCompletion(input: { userId: string; username: string; fileId: string }): Promise<UploadCompletionSnapshot | null> {
  const row = (await db()
    .select({
      fileId: uploadFiles.id,
      batchId: uploadFiles.batchId,
      relativePath: uploadFiles.relativePath,
      storagePath: uploadFiles.storagePath,
      size: uploadFiles.size,
      mimeType: uploadFiles.mimeType,
      fileStatus: uploadFiles.status,
      batchStatus: uploadBatches.status,
    })
    .from(uploadFiles)
    .innerJoin(uploadBatches, eq(uploadFiles.batchId, uploadBatches.id))
    .where(and(eq(uploadFiles.id, input.fileId), eq(uploadBatches.userId, input.userId)))
    .limit(1))[0];
  return row ? { ...row, userId: input.userId, username: input.username } : null;
}

function completionNotification(
  snapshot: UploadCompletionSnapshot,
  batch: { fileCount: number; totalBytes: number },
  completedAt: Date,
): CompletionNotificationInput {
  return {
    batchId: snapshot.batchId,
    username: snapshot.username,
    fileCount: batch.fileCount,
    totalBytes: batch.totalBytes,
    completedAt,
  };
}

async function finalizeVerifiedCompletion(snapshot: UploadCompletionSnapshot, verification: StorageObjectVerification | null) {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`batch:${snapshot.batchId}`}))`);

    // Ownership and current manifest state are re-read after taking the lock;
    // the pre-verification snapshot is never sufficient authority for writes.
    const batch = (await tx
      .select({
        id: uploadBatches.id,
        userId: uploadBatches.userId,
        status: uploadBatches.status,
        fileCount: uploadBatches.fileCount,
        totalBytes: uploadBatches.totalBytes,
        completedAt: uploadBatches.completedAt,
      })
      .from(uploadBatches)
      .where(and(eq(uploadBatches.id, snapshot.batchId), eq(uploadBatches.userId, snapshot.userId)))
      .limit(1))[0];
    if (!batch) return { kind: "unavailable" as const };

    const current = (await tx
      .select({
        id: uploadFiles.id,
        batchId: uploadFiles.batchId,
        relativePath: uploadFiles.relativePath,
        storagePath: uploadFiles.storagePath,
        size: uploadFiles.size,
        mimeType: uploadFiles.mimeType,
        status: uploadFiles.status,
      })
      .from(uploadFiles)
      .where(and(eq(uploadFiles.id, snapshot.fileId), eq(uploadFiles.batchId, batch.id)))
      .limit(1))[0];
    if (!current) return { kind: "unavailable" as const };

    const counts = batch.status === "completed" ? null : (await tx
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${uploadFiles.status} = 'completed')::int`,
      })
      .from(uploadFiles)
      .where(eq(uploadFiles.batchId, batch.id)))[0];
    const decision = decideUploadCompletionTransaction({ snapshot, batch, current, verification, counts, now: new Date() });
    if (decision.kind === "unavailable") return decision;
    if (decision.kind === "terminal") return decision;
    if (decision.kind === "verification_mismatch") return decision;

    if (decision.fileUpdate) {
      const updated = (await tx
        .update(uploadFiles)
        .set(decision.fileUpdate)
        .where(and(eq(uploadFiles.id, current.id), eq(uploadFiles.batchId, batch.id), ne(uploadFiles.status, "completed")))
        .returning({ id: uploadFiles.id }))[0];
      if (!updated) return { kind: "unavailable" as const };
    }
    if (decision.kind === "partial") return { kind: "partial" as const };

    if (decision.transitioned) {
      const transitioned = (await tx
        .update(uploadBatches)
        .set({ status: "completed", completedBytes: batch.totalBytes, completedAt: decision.completedAt })
        .where(and(eq(uploadBatches.id, batch.id), eq(uploadBatches.userId, snapshot.userId), eq(uploadBatches.status, batch.status)))
        .returning({ id: uploadBatches.id }))[0];
      if (!transitioned) return { kind: "unavailable" as const };
    }
    return {
      kind: "complete" as const,
      transitioned: decision.transitioned,
      notification: completionNotification(snapshot, batch, decision.completedAt),
    };
  });
}

const completeUpload = createUploadCompletionOrchestrator({
  loadOwned: loadOwnedCompletion,
  verify: verifyStorageObject,
  finalize: finalizeVerifiedCompletion,
  notify: deliverCompletionNotification,
});

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await requireUser();
    const parsed = await parseUploadCompletionRequest(request);
    if (parsed.kind === "invalid") return NextResponse.json({ error: "The upload completion data is invalid." }, { status: 400 });

    const result = await completeUpload({ userId: user.id, username: user.username, fileId: parsed.data.fileId });
    const response = mapUploadCompletionResult(result);
    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadCompletionError) {
      const message = error.code === "verification_failed"
        ? "Storage could not verify the uploaded file. Retry safely."
        : "The uploaded file could not be finalized. Retry safely.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ error: "The uploaded file could not be finalized. Retry safely." }, { status: 502 });
  }
}
