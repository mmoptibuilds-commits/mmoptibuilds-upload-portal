import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, passwordVerify } from "@/lib/auth";
import { log } from "@/lib/log";
import { z } from "zod";

const inputSchema = z.object({ username: z.string().trim().min(2).max(64), password: z.string().min(1).max(256), remember: z.boolean().optional().default(false) });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  const username = parsed.data.username.toLowerCase();
  const user = (await db().select().from(users).where(eq(users.username, username)).limit(1))[0];
  if (!user || !(await passwordVerify(parsed.data.password, user.passwordHash))) {
    log({ action: "login_failed", username });
    return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
  }
  if (!user.enabled) return NextResponse.json({ error: "This account has been disabled. Contact mmoptibuilds." }, { status: 403 });
  await db().update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  await createSession({ id: user.id, username: user.username, role: user.role, enabled: user.enabled }, parsed.data.remember);
  log({ action: "login_success", userId: user.id });
  return NextResponse.json({ ok: true, role: user.role });
}
