import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { CustodyStrip, EmptyState, Status } from "@/components/ui";

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
    <header className="page-header"><div><CustodyStrip route="BATCHES">LEDGER:ALL ▦ STORAGE:PRIVATE ▦ CLIENT-DATA:UNTRUSTED</CustodyStrip><span className="eyebrow">DELIVERY LEDGER</span><h1>Upload batches</h1><p>Administrative metadata for private client deliveries. File content is never rendered in this control room.</p></div></header>
    <section className="admin-panel material-surface" aria-labelledby="ledger-title">
      <div className="panel-head"><div><span className="eyebrow">PRIVATE STORAGE</span><h2 id="ledger-title">Latest batches</h2></div><span className="status status-blue"><i />Latest {batches.length} recorded</span></div>
      {batches.length ? <div className="table-wrap"><table className="responsive-table"><caption className="sr-only">Upload batches, page {page + 1}</caption><thead><tr><th>Client</th><th>Batch</th><th>State</th><th>Size</th><th>Notice</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td data-label="Client">{batch.username}</td><td data-label="Batch"><b>{batch.displayName}</b><small>{batch.fileCount} files · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(batch.createdAt)}</small></td><td data-label="State"><Status tone={batch.status === "completed" ? "green" : batch.status.includes("fail") ? "red" : "orange"}>{batch.status.replace("_", " ")}</Status></td><td data-label="Size">{(batch.totalBytes / 1024 / 1024).toFixed(1)} MB</td><td data-label="Notice">{batch.notificationStatus}</td></tr>)}</tbody></table></div> : <EmptyState title="No batches on this page." detail={page ? "Go to the previous page to view newer deliveries." : "Client uploads will appear here after the first transfer is prepared."} />}
      {(page > 0 || hasNext) && <nav className="pagination" aria-label="Upload batch pages">{page > 0 ? <Link className="button button-secondary" href={`/admin/uploads?page=${page - 1}`}>Previous</Link> : <span /> }<span>Page {page + 1}</span>{hasNext ? <Link className="button button-secondary" href={`/admin/uploads?page=${page + 1}`}>Next</Link> : <span />}</nav>}
    </section>
  </AppShell>;
}
