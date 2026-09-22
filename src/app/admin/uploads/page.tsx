import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { EmptyState, formatBytes, formatStatus, Status } from "@/components/ui";

const PAGE_SIZE = 50;

export default async function AdminUploads({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");

  const requestedPage = Number.parseInt((await searchParams).page ?? "0", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 0), 10_000) : 0;
  const rows = await db().select({ id: uploadBatches.id, displayName: uploadBatches.displayName, status: uploadBatches.status, fileCount: uploadBatches.fileCount, totalBytes: uploadBatches.totalBytes, notificationStatus: uploadBatches.notificationStatus, createdAt: uploadBatches.createdAt, username: users.username }).from(uploadBatches).innerJoin(users, eq(users.id, uploadBatches.userId)).orderBy(desc(uploadBatches.createdAt)).limit(PAGE_SIZE + 1).offset(page * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const batches = rows.slice(0, PAGE_SIZE);

  return <AppShell user={user}>
    <header className="page-header"><div><h1>Upload batches</h1><p>Recorded client upload batches. File contents are never shown here.</p></div></header>
    <section className="admin-panel material-surface" aria-labelledby="batches-title">
      <div className="panel-head"><h2 id="batches-title">Latest batches</h2><span className="panel-note">{batches.length} recorded</span></div>
      {batches.length ? <div className="table-wrap"><table className="responsive-table"><caption className="sr-only">Upload batches, page {page + 1}</caption><thead><tr><th>Client</th><th>Batch</th><th>Status</th><th>Size</th><th>Notification</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td data-label="Client">{batch.username}</td><td data-label="Batch"><b>{batch.displayName}</b><small>{batch.fileCount} files · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(batch.createdAt)}</small></td><td data-label="Status"><Status tone={batch.status === "completed" ? "green" : batch.status.includes("fail") ? "red" : "orange"}>{formatStatus(batch.status)}</Status></td><td data-label="Size">{formatBytes(batch.totalBytes)}</td><td data-label="Notification">{formatStatus(batch.notificationStatus)}</td></tr>)}</tbody></table></div> : <EmptyState title={page ? "No batches on this page" : "No upload batches yet"} detail={page ? "Go to the previous page to view newer uploads." : "Client uploads will appear here after the first batch is prepared."} />}
      {(page > 0 || hasNext) && <nav className="pagination" aria-label="Upload batch pages">{page > 0 ? <Link className="button button-secondary" href={`/admin/uploads?page=${page - 1}`}>Previous</Link> : <span /> }<span>Page {page + 1}</span>{hasNext ? <Link className="button button-secondary" href={`/admin/uploads?page=${page + 1}`}>Next</Link> : <span />}</nav>}
    </section>
  </AppShell>;
}
