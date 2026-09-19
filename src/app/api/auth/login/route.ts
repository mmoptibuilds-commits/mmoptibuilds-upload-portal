import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, passwordVerify } from "@/lib/auth";
import { log } from "@/lib/log";
import { checkLoginRateLimit, clearLoginAccount, recordLoginFailure } from "@/lib/rate-limit";
import { z } from "zod";

const inputSchema = z.object({ username: z.string().trim().min(2).max(64), password: z.string().min(1).max(256), remember: z.boolean().optional().default(false) });
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$1nzScQ7cIP7l1iBXPzTvtw$BOZcHqZphmvuJZQvnxBqVqPeZqLjSoL0JxhZkogwgx8";

export async function POST(request: Request) {
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
    const username = parsed.data.username.toLowerCase();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const limit = checkLoginRateLimit(ip, username);
    if (!limit.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const user = (await db().select().from(users).where(eq(users.username, username)).limit(1))[0];
    const validPassword = await passwordVerify(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !validPassword) {
      recordLoginFailure(ip, username);
      log({ action: "login_failed", username });
      return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
    }
    if (!user.enabled) return NextResponse.json({ error: "This account has been disabled. Contact mmoptibuilds." }, { status: 403 });
    clearLoginAccount(username);
    await db().update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await createSession({ id: user.id, username: user.username, role: user.role, enabled: user.enabled }, parsed.data.remember);
    log({ action: "login_success", userId: user.id });
    return NextResponse.json({ ok: true, role: user.role });
  } catch (error) {
    log({ action: "login_unavailable", detail: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
