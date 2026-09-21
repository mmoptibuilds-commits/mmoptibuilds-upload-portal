import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { isSameOriginRequest, safeRelativePath } from "@/lib/security";
import { createSignedUploadAuthorization } from "@/lib/storage";
import { deriveStorageObjectPath } from "@/lib/storage-path";
import {
  buildAuthorizedUploadUpdate,
  buildUploadReservationValues,
  classifyUploadReservation,
  createUploadInitializationOrchestrator,
  isUploadBatchActiveStatus,
  mapUploadInitializationResult,
  parseUploadInitializationRequest,
  UploadInitializationError,
  type UploadInitializationInput,
} from "@/lib/upload-initialization";

type InitInput = UploadInitializationInput;

async function reserveUpload(input: InitInput) {
  return db().transaction(async (tx) => {
    // Serialize ownership, manifest accounting, and idempotent path reservation,
    // then release the database connection before requesting storage authorization.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`batch:${input.batchId}`}))`);
    const batch = (await tx.select().from(uploadBatches).where(and(eq(uploadBatches.id, input.batchId), eq(uploadBatches.userId, input.userId))).limit(1))[0];
    if (!batch || batch.status === "cancelled" || batch.status === "completed" || batch.status === "failed") return { kind: "unavailable" as const };

    const existing = (await tx.select().from(uploadFiles).where(and(eq(uploadFiles.batchId, batch.id), eq(uploadFiles.relativePath, input.relativePath))).limit(1))[0];
    if (existing) {
      const decision = classifyUploadReservation(existing, input, input.storagePath);
      if (decision === "conflict") return { kind: "conflict" as const };
      if (decision === "completed") return { kind: "completed" as const };
      if (existing.storagePath === input.storagePath) return { kind: "reserved" as const, fileId: existing.id, isNew: false };
      const row = (await tx.update(uploadFiles).set({ storagePath: input.storagePath }).where(eq(uploadFiles.id, existing.id)).returning())[0];
      return row ? { kind: "reserved" as const, fileId: row.id, isNew: false } : { kind: "unavailable" as const };
    }

    const manifest = (await tx.select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${uploadFiles.size}), 0)::bigint` }).from(uploadFiles).where(eq(uploadFiles.batchId, batch.id)))[0];
    if ((manifest?.count ?? 0) >= batch.fileCount || Number(manifest?.bytes ?? 0) + input.size > batch.totalBytes) return { kind: "limit" as const };
    const row = (await tx.insert(uploadFiles).values(buildUploadReservationValues(input, input.storagePath)).returning())[0];
    return row ? { kind: "reserved" as const, fileId: row.id, isNew: true } : { kind: "unavailable" as const };
  });
}

async function finalizeReservedUpload(
  input: InitInput,
  fileId: string,
  authorization: Awaited<ReturnType<typeof createSignedUploadAuthorization>>,
) {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`batch:${input.batchId}`}))`);
    const batch = (await tx.select({ id: uploadBatches.id, status: uploadBatches.status }).from(uploadBatches).where(and(
      eq(uploadBatches.id, input.batchId),
      eq(uploadBatches.userId, input.userId),
    )).limit(1))[0];
    if (!batch || !isUploadBatchActiveStatus(batch.status)) return { kind: "unavailable" as const };
    const current = (await tx.select().from(uploadFiles).where(and(eq(uploadFiles.id, fileId), eq(uploadFiles.batchId, input.batchId), eq(uploadFiles.relativePath, input.relativePath))).limit(1))[0];
    if (!current) return { kind: "unavailable" as const };
    const decision = classifyUploadReservation(current, input, input.storagePath);
    if (decision === "conflict") return { kind: "conflict" as const };
    if (decision === "completed") return { kind: "completed" as const };
    if (authorization.path !== input.storagePath) return { kind: "unavailable" as const };
    const row = (await tx.update(uploadFiles).set(buildAuthorizedUploadUpdate(input.storagePath)).where(eq(uploadFiles.id, current.id)).returning())[0];
    return row ? { kind: "authorized" as const, fileId: row.id, authorization } : { kind: "unavailable" as const };
  });
}

async function markReservedUploadFailed(fileId: string) {
  await db().update(uploadFiles).set({ status: "failed", errorCategory: "storage_authorization" }).where(and(eq(uploadFiles.id, fileId), eq(uploadFiles.status, "preparing")));
}

const initializeUpload = createUploadInitializationOrchestrator({
  reserve: reserveUpload,
  authorize: ({ userId, batchId, relativePath }) => createSignedUploadAuthorization({ userId, batchId, relativePath }),
  finalize: (input, reservation, authorization) => finalizeReservedUpload(input, reservation.fileId, authorization),
  markAuthorizationFailed: markReservedUploadFailed,
});

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await requireUser();
    const parsed = await parseUploadInitializationRequest(request);
    if (parsed.kind === "invalid") return NextResponse.json({ error: "This file metadata is invalid." }, { status: 400 });
    let relativePath: string;
    try { relativePath = safeRelativePath(parsed.data.relativePath); } catch { return NextResponse.json({ error: "This file path is invalid." }, { status: 400 }); }
    const fileName = relativePath.split("/").at(-1)!;
    let storagePath: string;
    try { storagePath = deriveStorageObjectPath(user.id, parsed.data.batchId, relativePath); } catch { return NextResponse.json({ error: "This file path is invalid." }, { status: 400 }); }
    const input = { ...parsed.data, relativePath, fileName, userId: user.id, storagePath };
    const result = await initializeUpload(input);
    const response = mapUploadInitializationResult(result);
    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadInitializationError) {
      return NextResponse.json({ error: error.code === "authorization_failed" ? "Unable to authorize this upload. Check the connection and retry." : "Unable to finalize this upload authorization. Check the connection and retry." }, { status: 502 });
    }
    return NextResponse.json({ error: "Unable to initialize this upload. Check the connection and retry." }, { status: 502 });
  }
}
