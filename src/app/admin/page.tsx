import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Metric, Status } from "@/components/ui";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");

  const [stats, recent] = await Promise.all([
    db().select({ users: sql<number>`count(distinct ${users.id})::int`, activeUsers: sql<number>`count(distinct ${users.id}) filter (where ${users.enabled})::int`, batches: sql<number>`count(${uploadBatches.id})::int`, bytes: sql<number>`coalesce(sum(${uploadBatches.totalBytes}), 0)::bigint`, failed: sql<number>`count(${uploadBatches.id}) filter (where ${uploadBatches.status} in ('failed','partial_failure'))::int` }).from(users).leftJoin(uploadBatches, eq(uploadBatches.userId, users.id)),
    db().select({ id: uploadBatches.id, name: uploadBatches.displayName, status: uploadBatches.status, fileCount: uploadBatches.fileCount, totalBytes: uploadBatches.totalBytes, createdAt: uploadBatches.createdAt, username: users.username }).from(uploadBatches).innerJoin(users, eq(uploadBatches.userId, users.id)).orderBy(desc(uploadBatches.createdAt)).limit(6),
  ]);
  const s = stats[0];

  return <AppShell user={user}>
    <header className="page-header"><div><span className="eyebrow">ADMIN CONTROL ROOM</span><h1>Transfer systems</h1><p>Users, delivery state, and storage handoff in one controlled surface.</p></div><Link className="button button-primary" href="/admin/users">Manage users</Link></header>
    <section className="metric-grid"><Metric label="Total users" value={s.users} detail={`${s.activeUsers} enabled`} /><Metric label="Upload batches" value={s.batches} detail={`${s.failed} need attention`} /><Metric label="Recorded delivery" value={`${(s.bytes / 1024 / 1024 / 1024).toFixed(1)} GB`} detail="Metadata only" /><Metric label="Drive state" value="Ready" detail="Server-side integration" /></section>
    <section className="admin-panel material-surface" aria-labelledby="recent-delivery-title">
      <div className="panel-head"><div><span className="eyebrow">RECENT DELIVERY</span><h2 id="recent-delivery-title">Latest batches</h2></div><Link href="/admin/uploads">View all</Link></div>
      {recent.length ? <div className="table-wrap"><table className="responsive-table"><thead><tr><th>Client</th><th>Batch</th><th>State</th><th>Files</th><th>Received</th></tr></thead><tbody>{recent.map((batch) => <tr key={batch.id}><td data-label="Client">{batch.username}</td><td data-label="Batch">{batch.name}</td><td data-label="State"><Status tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"}>{batch.status.replace("_", " ")}</Status></td><td data-label="Files">{batch.fileCount}</td><td data-label="Received">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(batch.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No delivery batches yet." detail="Completed and in-progress client transfers will appear here." />}
    </section>
  </AppShell>;
}
