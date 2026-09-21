import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { AdminUsers } from "@/components/admin-users";
export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");
  const initialRows = await db().select({
    id: users.id,
    username: users.username,
    role: users.role,
    enabled: users.enabled,
    createdAt: users.createdAt,
    lastLoginAt: users.lastLoginAt,
    batchCount: sql<number>`count(${uploadBatches.id})::int`,
    totalBytes: sql<number>`coalesce(sum(${uploadBatches.totalBytes}), 0)::bigint`,
  }).from(users).leftJoin(uploadBatches, eq(uploadBatches.userId, users.id)).groupBy(users.id).orderBy(desc(users.createdAt)).limit(101);
  return <AppShell user={user}><AdminUsers initialUsers={initialRows.slice(0, 100)} initialHasMore={initialRows.length > 100} /></AppShell>;
}
