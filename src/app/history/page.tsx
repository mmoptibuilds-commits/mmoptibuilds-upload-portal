import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { EmptyState, formatBytes, formatStatus, Status } from "@/components/ui";

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
    <header className="page-header"><div><h1>Upload history</h1><p>Completed and in-progress uploads are listed here. Files cannot be opened or downloaded from this portal.</p></div></header>
    {!batches.length ? <EmptyState title={page ? "No uploads on this page" : "No uploads yet"} detail={page ? "Go to the previous page to view newer uploads." : "Completed and in-progress uploads will appear here."} /> : <ul className="history-list">{batches.map((batch) => <li className="history-row" key={batch.id}><div><Status tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"}>{formatStatus(batch.status)}</Status><h2>{batch.displayName}</h2></div><span>{batch.fileCount} files · {formatBytes(batch.totalBytes)}</span><time dateTime={batch.createdAt.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(batch.createdAt)}</time></li>)}</ul>}
    {(page > 0 || hasNext) && <nav className="pagination" aria-label="Upload history pages">{page > 0 ? <Link className="button button-secondary" href={`/history?page=${page - 1}`}>Previous</Link> : <span /> }<span>Page {page + 1}</span>{hasNext ? <Link className="button button-secondary" href={`/history?page=${page + 1}`}>Next</Link> : <span />}</nav>}
  </AppShell>;
}
