import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { promiseWithTimeout } from "@/lib/async-timeouts";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { opaqueId } from "@/lib/security";
import { REMEMBER_SESSION_MS, SESSION_COOKIE, SHORT_SESSION_MS } from "@/lib/constants";
import type { Role } from "@/lib/types";

export type SessionUser = { id: string; username: string; role: Role; enabled: boolean };

export async function passwordHash(password: string) {
  return hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function passwordVerify(password: string, passwordHashValue: string) {
  return verify(passwordHashValue, password);
}

export async function createSession(user: SessionUser, remember: boolean) {
  const id = opaqueId();
  const expiresAt = new Date(Date.now() + (remember ? REMEMBER_SESSION_MS : SHORT_SESSION_MS));
  await db().insert(sessions).values({ id, userId: user.id, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function deleteSession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  if (!id) return;
  try {
    await promiseWithTimeout(db().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id)), 3_000, "Session revocation");
  } catch {
    // The browser cookie is already cleared; do not strand the user on logout
    // when the database is unavailable or a request is aborted.
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const result = await db().select({ id: users.id, username: users.username, role: users.role, enabled: users.enabled })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
  const user = result[0];
  if (!user?.enabled) return null;
  return user as SessionUser;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AuthError(401, "Sign in is required.");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError(403, "Administrator permission is required.");
  return user;
}

export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
