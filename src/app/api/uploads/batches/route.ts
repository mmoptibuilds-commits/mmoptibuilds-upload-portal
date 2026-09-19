import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadBatches } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { createBatchFolder } from "@/lib/drive";
import { z } from "zod";
import { log } from "@/lib/log";
import { MAX_BATCH_BYTES, MAX_BATCH_FILES } from "@/lib/constants";

const schema = z.object({ displayName: z.string().trim().min(1).max(120), fileCount: z.number().int().positive().max(MAX_BATCH_FILES), totalBytes: z.number().finite().nonnegative().max(MAX_BATCH_BYTES) });
export async function POST(request: Request) {
  try {
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "The upload batch details are invalid." }, { status: 400 });
    // First create a DB id; it gives the Drive folder an unguessable collision-safe suffix.
    const draft = (await db().insert(uploadBatches).values({ userId: user.id, displayName: parsed.data.displayName, fileCount: parsed.data.fileCount, totalBytes: parsed.data.totalBytes, driveFolderId: "pending", status: "preparing" }).returning())[0];
    try {
      const folder = await db().transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`user-root:${user.id}`}))`);
        return createBatchFolder(user.username, draft.id);
      });
      await db().update(uploadBatches).set({ driveFolderId: folder.id, status: "queued", startedAt: new Date() }).where((await import("drizzle-orm")).eq(uploadBatches.id, draft.id));
      log({ action: "batch_created", userId: user.id, batchId: draft.id });
      return NextResponse.json({ batchId: draft.id });
    } catch (error) {
      await db().update(uploadBatches).set({ status: "failed", errorCategory: "drive_initialization" }).where((await import("drizzle-orm")).eq(uploadBatches.id, draft.id));
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Drive could not prepare this upload. Check the connection and retry." }, { status: 502 });
  }
}
