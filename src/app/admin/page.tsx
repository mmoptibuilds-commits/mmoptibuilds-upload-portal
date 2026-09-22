import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { getOptionalConfig } from "@/lib/env";
import { AppShell } from "@/components/app-shell";
import { EmptyState, formatBytes, formatStatus, Metric, Status } from "@/components/ui";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");

  const [stats, recent] = await Promise.all([
    db().select({ users: sql<number>`count(distinct ${users.id})::int`, activeUsers: sql<number>`count(distinct ${users.id}) filter (where ${users.enabled})::int`, batches: sql<number>`count(${uploadBatches.id})::int`, bytes: sql<number>`coalesce(sum(${uploadBatches.totalBytes}), 0)::bigint`, failed: sql<number>`count(${uploadBatches.id}) filter (where ${uploadBatches.status} in ('failed','partial_failure'))::int` }).from(users).leftJoin(uploadBatches, eq(uploadBatches.userId, users.id)),
    db().select({ id: uploadBatches.id, name: uploadBatches.displayName, status: uploadBatches.status, fileCount: uploadBatches.fileCount, createdAt: uploadBatches.createdAt, username: users.username }).from(uploadBatches).innerJoin(users, eq(uploadBatches.userId, users.id)).orderBy(desc(uploadBatches.createdAt)).limit(6),
  ]);
  const summary = stats[0];
  const config = getOptionalConfig();

  return <AppShell user={user}>
    <header className="page-header"><div><h1>Overview</h1><p>Monitor client uploads, accounts, and system readiness.</p></div><Link className="button button-primary" href="/admin/users">Manage users</Link></header>
    <section className="metric-grid"><Metric label="Users" value={summary.users} detail={`${summary.activeUsers} enabled`} /><Metric label="Upload batches" value={summary.batches} detail={summary.failed ? `${summary.failed} need attention` : "No failures recorded"} /><Metric label="Recorded upload volume" value={formatBytes(summary.bytes)} detail="Across all upload batches" /><Metric label="Private storage" value={config.storage ? "Ready" : "Needs attention"} detail={config.storage ? "Configured" : "Check system status"} /></section>
    <section className="admin-panel material-surface" aria-labelledby="recent-upload-title">
      <div className="panel-head"><h2 id="recent-upload-title">Recent upload batches</h2><Link href="/admin/uploads">View all</Link></div>
      {recent.length ? <div className="table-wrap"><table className="responsive-table"><caption className="sr-only">Recent upload batches</caption><thead><tr><th>Client</th><th>Batch</th><th>Status</th><th>Files</th><th>Received</th></tr></thead><tbody>{recent.map((batch) => <tr key={batch.id}><td data-label="Client">{batch.username}</td><td data-label="Batch">{batch.name}</td><td data-label="Status"><Status tone={batch.status === "completed" ? "green" : batch.status.includes("fail") ? "red" : "orange"}>{formatStatus(batch.status)}</Status></td><td data-label="Files">{batch.fileCount}</td><td data-label="Received">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(batch.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No upload batches yet" detail="Completed and in-progress client uploads will appear here." />}
    </section>
  </AppShell>;
}
