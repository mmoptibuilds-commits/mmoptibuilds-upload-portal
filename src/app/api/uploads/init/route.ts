import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { initResumableUpload } from "@/lib/drive";
import { safeRelativePath } from "@/lib/security";
import { MAX_BATCH_BYTES } from "@/lib/constants";
import { z } from "zod";

const cache = new Map<string, Map<string, string>>();
const schema = z.object({ batchId: z.string().uuid(), relativePath: z.string().min(1).max(2048), size: z.number().int().nonnegative().max(MAX_BATCH_BYTES), mimeType: z.string().max(255).optional().default("application/octet-stream"), resetSession: z.boolean().optional().default(false) });

function folderCache(batchId: string) {
  const existing = cache.get(batchId);
  if (existing) return existing;
  if (cache.size >= 256) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  const created = new Map<string, string>();
  cache.set(batchId, created);
  return created;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "This file metadata is invalid." }, { status: 400 });
    const batch = (await db().select().from(uploadBatches).where(and(eq(uploadBatches.id, parsed.data.batchId), eq(uploadBatches.userId, user.id))).limit(1))[0];
    if (!batch || batch.status === "cancelled" || batch.status === "completed" || batch.status === "failed") return NextResponse.json({ error: "This upload batch is unavailable." }, { status: 404 });
    let relativePath: string;
    try { relativePath = safeRelativePath(parsed.data.relativePath); } catch { return NextResponse.json({ error: "This file path is invalid." }, { status: 400 }); }
    const fileName = relativePath.split("/").at(-1)!;
    const result = await db().transaction(async (tx) => {
      // Keep the declared manifest and folder creation consistent across Vercel instances.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`batch:${batch.id}`}))`);
      const folderParts = relativePath.split("/").slice(0, -1);
      for (let index = 0; index < folderParts.length; index += 1) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`folder:${batch.driveFolderId}:${folderParts.slice(0, index + 1).join("/")}`}))`);
      const existing = (await tx.select().from(uploadFiles).where(and(eq(uploadFiles.batchId, batch.id), eq(uploadFiles.relativePath, relativePath))).limit(1))[0];
      if (existing && (existing.fileName !== fileName || existing.size !== parsed.data.size || existing.mimeType !== parsed.data.mimeType)) return { kind: "conflict" as const };
      if (existing?.status === "completed") return { kind: "completed" as const };
      if (existing?.driveFileId && existing.size === 0 && !parsed.data.resetSession) return { kind: "existing" as const, row: existing };
      if (existing?.resumableSessionUrl && !parsed.data.resetSession) return { kind: "existing" as const, row: existing };
      const manifest = (await tx.select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${uploadFiles.size}), 0)::bigint` }).from(uploadFiles).where(eq(uploadFiles.batchId, batch.id)))[0];
      // A reset replaces the existing manifest row; do not reject it merely
      // because the batch is already at its declared file/byte limit.
      const replacedCount = existing ? 1 : 0;
      const replacedBytes = existing?.size ?? 0;
      if ((manifest?.count ?? 0) - replacedCount >= batch.fileCount || Number(manifest?.bytes ?? 0) - replacedBytes + parsed.data.size > batch.totalBytes) return { kind: "limit" as const };
      const initialized = await initResumableUpload({ name: fileName, relativePath, size: parsed.data.size, mimeType: parsed.data.mimeType, batchFolderId: batch.driveFolderId, folderCache: folderCache(batch.id) });
      const row = (await tx.insert(uploadFiles).values({ batchId: batch.id, relativePath, fileName, size: parsed.data.size, mimeType: parsed.data.mimeType, status: "uploading", driveParentId: initialized.parent, driveFileId: initialized.driveFileId, resumableSessionUrl: initialized.sessionUrl }).onConflictDoUpdate({ target: [uploadFiles.batchId, uploadFiles.relativePath], set: { status: "uploading", driveParentId: initialized.parent, driveFileId: initialized.driveFileId, resumableSessionUrl: initialized.sessionUrl, errorCategory: null } }).returning())[0];
      return { kind: "new" as const, row };
    });
    if (result.kind === "conflict") return NextResponse.json({ error: "A different file is already queued at this path." }, { status: 409 });
    if (result.kind === "completed") return NextResponse.json({ error: "This file is already finalized." }, { status: 409 });
    if (result.kind === "limit") return NextResponse.json({ error: "This file would exceed the batch manifest limit." }, { status: 409 });
    return NextResponse.json({ fileId: result.row.id, sessionUrl: result.row.resumableSessionUrl, driveFileId: result.row.driveFileId });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Unable to create the upload session. Check the connection and retry." }, { status: 502 });
  }
}
