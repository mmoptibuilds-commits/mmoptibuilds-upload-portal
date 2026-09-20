import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Status } from "@/components/ui";

export default async function HistoryPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const batches = await db().select().from(uploadBatches).where(eq(uploadBatches.userId, user.id)).orderBy(desc(uploadBatches.createdAt));

  return <AppShell user={user}>
    <header className="page-header"><div><span className="eyebrow">CLIENT RECORD</span><h1>Your uploads</h1><p>Submission records only. Files remain private and cannot be downloaded here.</p></div></header>
    {!batches.length ? <EmptyState title="No uploads yet." detail="Your completed transfers will appear here, without exposing file access." /> : <ul className="history-list">{batches.map((batch) => <li className="history-card" key={batch.id}><div><Status tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"}>{batch.status.replace("_", " ")}</Status><h2>{batch.displayName}</h2><p>{batch.fileCount} files · {(batch.totalBytes / 1024 / 1024).toFixed(1)} MB</p></div><time dateTime={batch.createdAt.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(batch.createdAt)}</time></li>)}</ul>}
  </AppShell>;
}
