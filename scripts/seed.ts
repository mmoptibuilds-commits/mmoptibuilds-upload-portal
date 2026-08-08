import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { passwordHash } from "@/lib/auth";

const seeds = [
  { username: "mmoptibuilds", password: process.env.INITIAL_MMOPTIBUILDS_PASSWORD, role: "user" as const },
  { username: "twaha", password: process.env.INITIAL_TWAHA_PASSWORD, role: "user" as const },
  { username: "admin", password: process.env.INITIAL_ADMIN_PASSWORD, role: "admin" as const },
];
for (const seed of seeds) {
  if (!seed.password) throw new Error(`INITIAL_${seed.username.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PASSWORD is required for secure setup.`);
  const exists = (await db().select({ id: users.id }).from(users).where(eq(users.username, seed.username)).limit(1))[0];
  if (exists) { console.log(`${seed.username} already exists; skipped.`); continue; }
  await db().insert(users).values({ username: seed.username, passwordHash: await passwordHash(seed.password), role: seed.role, enabled: true });
  console.log(`${seed.username} created.`);
}
