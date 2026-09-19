import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { passwordHash } from "@/lib/auth";

const username = process.env.RESET_USERNAME?.trim().toLowerCase();
const password = process.env.RESET_PASSWORD;
if (!username || !password || password.length < 10) throw new Error("Set RESET_USERNAME and a RESET_PASSWORD of at least 10 characters.");

const user = (await db().select({ id: users.id, username: users.username }).from(users).where(eq(users.username, username)).limit(1))[0];
if (!user) throw new Error(`No user exists for ${username}.`);
const passwordHashValue = await passwordHash(password);
await db().transaction(async (tx) => {
  await tx.update(users).set({ passwordHash: passwordHashValue, updatedAt: new Date() }).where(eq(users.id, user.id));
  await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
});
console.log(`Password reset and active sessions revoked for ${user.username}.`);
