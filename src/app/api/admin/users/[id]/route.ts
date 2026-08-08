import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { AuthError, passwordHash, requireAdmin } from "@/lib/auth";
import { z } from "zod";
const schema = z.object({ enabled: z.boolean().optional(), password: z.string().min(10).max(256).optional(), role: z.enum(["admin", "user"]).optional() }).refine((value) => value.enabled !== undefined || value.password || value.role, "No changes supplied");
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin(); const { id } = await context.params; const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid user update." }, { status: 400 });
    if (id === actor.id && parsed.data.enabled === false) return NextResponse.json({ error: "You cannot disable your own active admin account." }, { status: 400 });
    const update: { enabled?: boolean; passwordHash?: string; role?: "admin" | "user"; updatedAt: Date } = { updatedAt: new Date() };
    if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled; if (parsed.data.role) update.role = parsed.data.role; if (parsed.data.password) update.passwordHash = await passwordHash(parsed.data.password);
    const changed = (await db().update(users).set(update).where(eq(users.id, id)).returning({ id: users.id, username: users.username, enabled: users.enabled, role: users.role }))[0];
    if (!changed) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (parsed.data.enabled === false || parsed.data.password) await db().update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
    return NextResponse.json({ user: changed });
  } catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Could not update user." }, { status: error instanceof AuthError ? error.status : 500 }); }
}
