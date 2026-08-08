import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { AdminUsers } from "@/components/admin-users";
export default async function AdminUsersPage() { const user = await currentUser(); if (!user) redirect("/login"); if (user.role !== "admin") redirect("/upload"); const initialUsers = (await db().select({ id: users.id, username: users.username, role: users.role, enabled: users.enabled, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).orderBy(desc(users.createdAt))).map((row) => ({ ...row, batchCount: 0, totalBytes: 0 })); return <AppShell user={user}><AdminUsers initialUsers={initialUsers} /></AppShell>; }
