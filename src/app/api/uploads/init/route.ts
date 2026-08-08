import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadBatches, uploadFiles } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { initResumableUpload } from "@/lib/drive";
import { safeRelativePath } from "@/lib/security";
import { z } from "zod";

const cache = new Map<string, Map<string, string>>();
const schema = z.object({ batchId: z.string().uuid(), relativePath: z.string().min(1).max(2048), size: z.number().int().nonnegative(), mimeType: z.string().max(255).optional().default("application/octet-stream") });
export async function POST(request: Request) {
  try {
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "This file metadata is invalid." }, { status: 400 });
    const batch = (await db().select().from(uploadBatches).where(and(eq(uploadBatches.id, parsed.data.batchId), eq(uploadBatches.userId, user.id))).limit(1))[0];
    if (!batch || batch.status === "cancelled") return NextResponse.json({ error: "This upload batch is unavailable." }, { status: 404 });
    const relativePath = safeRelativePath(parsed.data.relativePath); const fileName = relativePath.split("/").at(-1)!;
    const folderCache = cache.get(batch.id) ?? new Map<string, string>(); cache.set(batch.id, folderCache);
    const initialized = await initResumableUpload({ name: fileName, relativePath, size: parsed.data.size, mimeType: parsed.data.mimeType, batchFolderId: batch.driveFolderId, folderCache });
    const row = (await db().insert(uploadFiles).values({ batchId: batch.id, relativePath, fileName, size: parsed.data.size, mimeType: parsed.data.mimeType, status: "uploading", driveParentId: initialized.parent, resumableSessionUrl: initialized.sessionUrl }).onConflictDoUpdate({ target: [uploadFiles.batchId, uploadFiles.relativePath], set: { status: "uploading", driveParentId: initialized.parent, resumableSessionUrl: initialized.sessionUrl, errorCategory: null } }).returning())[0];
    return NextResponse.json({ fileId: row.id, sessionUrl: initialized.sessionUrl });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the upload session." }, { status: 502 });
  }
}
