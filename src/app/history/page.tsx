import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { CustodyStrip, EmptyState, Status } from "@/components/ui";

const PAGE_SIZE = 50;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const requestedPage = Number.parseInt((await searchParams).page ?? "0", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 0), 10_000) : 0;
  const rows = await db().select().from(uploadBatches).where(eq(uploadBatches.userId, user.id)).orderBy(desc(uploadBatches.createdAt)).limit(PAGE_SIZE + 1).offset(page * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const batches = rows.slice(0, PAGE_SIZE);

  return <AppShell user={user}>
    <header className="page-header"><div><CustodyStrip route="HISTORY">RECEIPTS:READONLY ▦ FILES:PRIVATE ▦ LINKS:NONE</CustodyStrip><span className="eyebrow">CLIENT RECORD</span><h1>Your latest uploads</h1><p>Submission records only. Files remain private and cannot be downloaded here.</p></div></header>
    {!batches.length ? <EmptyState title="No uploads on this page." detail={page ? "Go to the previous page to view newer transfers." : "Your completed transfers will appear here, without exposing file access."} /> : <ul className="history-list">{batches.map((batch) => <li className="history-card" key={batch.id}><div><Status tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"}>{batch.status.replace("_", " ")}</Status><h2>{batch.displayName}</h2><p>{batch.fileCount} files · {(batch.totalBytes / 1024 / 1024).toFixed(1)} MB</p></div><time dateTime={batch.createdAt.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(batch.createdAt)}</time></li>)}</ul>}
    {(page > 0 || hasNext) && <nav className="pagination" aria-label="Upload history pages">{page > 0 ? <Link className="button button-secondary" href={`/history?page=${page - 1}`}>Previous</Link> : <span /> }<span>Page {page + 1}</span>{hasNext ? <Link className="button button-secondary" href={`/history?page=${page + 1}`}>Next</Link> : <span />}</nav>}
  </AppShell>;
}
