import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadBatches } from "@/lib/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { buildBatchInsertValues } from "@/lib/batch-metadata";
import { z } from "zod";
import { log } from "@/lib/log";
import { MAX_BATCH_BYTES, MAX_BATCH_FILES } from "@/lib/constants";
import { isSameOriginRequest } from "@/lib/security";

const schema = z.object({ displayName: z.string().trim().min(1).max(120), fileCount: z.number().int().positive().max(MAX_BATCH_FILES), totalBytes: z.number().finite().nonnegative().max(MAX_BATCH_BYTES) });
export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const user = await requireUser(); const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "The upload batch details are invalid." }, { status: 400 });
    const batch = (await db().insert(uploadBatches).values(buildBatchInsertValues({ userId: user.id, ...parsed.data })).returning())[0];
    log({ action: "batch_created", userId: user.id, batchId: batch.id });
    return NextResponse.json({ batchId: batch.id });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The upload batch could not be created. Please retry." }, { status: 500 });
  }
}
