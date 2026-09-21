import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { AuthError, passwordHash, requireAdmin } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/security";
import { z } from "zod";
const schema = z.object({ enabled: z.boolean().optional(), password: z.string().min(10).max(256).optional(), role: z.enum(["admin", "user"]).optional() }).refine((value) => value.enabled !== undefined || value.password || value.role, "No changes supplied");
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const actor = await requireAdmin(); const { id } = await context.params; const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid user update." }, { status: 400 });
    if (id === actor.id && (parsed.data.enabled === false || parsed.data.role === "user")) return NextResponse.json({ error: "You cannot remove administrator access from your own active account." }, { status: 400 });
    const update: { enabled?: boolean; passwordHash?: string; role?: "admin" | "user"; updatedAt: Date } = { updatedAt: new Date() };
    if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled; if (parsed.data.role) update.role = parsed.data.role; if (parsed.data.password) update.passwordHash = await passwordHash(parsed.data.password);
    const changed = await db().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mmoptibuilds:admin-roster'))`);
      const target = (await tx.select({ id: users.id, username: users.username, enabled: users.enabled, role: users.role }).from(users).where(eq(users.id, id)).limit(1))[0];
      if (!target) return { kind: "missing" as const };
      const removingAdmin = target.role === "admin" && target.enabled && (parsed.data.enabled === false || parsed.data.role === "user");
      if (removingAdmin) {
        const count = (await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.enabled, true))))[0]?.count ?? 0;
        if (count <= 1) return { kind: "last-admin" as const };
      }
      const updated = (await tx.update(users).set(update).where(eq(users.id, id)).returning({ id: users.id, username: users.username, enabled: users.enabled, role: users.role }))[0];
      if (updated && (parsed.data.enabled === false || parsed.data.password)) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      return updated ? { kind: "updated" as const, user: updated } : { kind: "missing" as const };
    });
    if (changed.kind === "missing") return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (changed.kind === "last-admin") return NextResponse.json({ error: "Keep at least one enabled administrator account." }, { status: 400 });
    return NextResponse.json({ user: changed.user });
  } catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Could not update user." }, { status: error instanceof AuthError ? error.status : 500 }); }
}
