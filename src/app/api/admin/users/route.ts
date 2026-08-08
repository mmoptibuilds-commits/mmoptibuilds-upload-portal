import { NextResponse } from "next/server";
import { asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { AuthError, passwordHash, requireAdmin } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,64}$/), password: z.string().min(10).max(256), role: z.enum(["admin", "user"]).default("user"), enabled: z.boolean().default(true) });
export async function GET(request: Request) {
  try {
    await requireAdmin(); const { searchParams } = new URL(request.url); const q = searchParams.get("q")?.trim(); const sort = searchParams.get("sort") === "oldest" ? asc(users.createdAt) : desc(users.createdAt);
    const rows = await db().select({ id: users.id, username: users.username, role: users.role, enabled: users.enabled, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, batchCount: sql<number>`count(${uploadBatches.id})::int`, totalBytes: sql<number>`coalesce(sum(${uploadBatches.totalBytes}), 0)::bigint` }).from(users).leftJoin(uploadBatches, eq(uploadBatches.userId, users.id)).where(q ? ilike(users.username, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined).groupBy(users.id).orderBy(sort);
    return NextResponse.json({ users: rows });
  } catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Could not load users." }, { status: error instanceof AuthError ? error.status : 500 }); }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(); const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Username uses 2–64 lowercase letters, numbers, dots, dashes, or underscores. Password must be at least 10 characters." }, { status: 400 });
    try {
      const created = (await db().insert(users).values({ username: parsed.data.username, passwordHash: await passwordHash(parsed.data.password), role: parsed.data.role, enabled: parsed.data.enabled }).returning({ id: users.id, username: users.username, role: users.role, enabled: users.enabled }))[0];
      await db().insert((await import("@/lib/db/schema")).auditEvents).values({ actorUserId: actor.id, action: "user.created", targetType: "user", targetId: created.id });
      return NextResponse.json({ user: created }, { status: 201 });
    } catch { return NextResponse.json({ error: "That username is already in use." }, { status: 409 }); }
  } catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Could not create user." }, { status: error instanceof AuthError ? error.status : 500 }); }
}
