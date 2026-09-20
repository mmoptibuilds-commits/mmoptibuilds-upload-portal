import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBatches, users } from "@/lib/db/schema";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Icon, Status } from "@/components/ui";

export default async function AdminUploads() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");

  const batches = await db().select({ id: uploadBatches.id, displayName: uploadBatches.displayName, status: uploadBatches.status, fileCount: uploadBatches.fileCount, totalBytes: uploadBatches.totalBytes, notificationStatus: uploadBatches.notificationStatus, createdAt: uploadBatches.createdAt, driveFolderId: uploadBatches.driveFolderId, username: users.username }).from(uploadBatches).innerJoin(users, eq(users.id, uploadBatches.userId)).orderBy(desc(uploadBatches.createdAt));

  return <AppShell user={user}>
    <header className="page-header"><div><span className="eyebrow">DELIVERY LEDGER</span><h1>Upload batches</h1><p>Administrative metadata and secure Drive handoff. Never render untrusted client files here.</p></div></header>
    <section className="admin-panel material-surface" aria-labelledby="ledger-title">
      <div className="panel-head"><div><span className="eyebrow">PRIVATE STORAGE HANDOFF</span><h2 id="ledger-title">All batches</h2></div><span className="status status-blue"><i />{batches.length} recorded</span></div>
      {batches.length ? <div className="table-wrap"><table className="responsive-table"><thead><tr><th>Client</th><th>Batch</th><th>State</th><th>Size</th><th>Notice</th><th>Drive</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td data-label="Client">{batch.username}</td><td data-label="Batch"><b>{batch.displayName}</b><small>{batch.fileCount} files · {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(batch.createdAt)}</small></td><td data-label="State"><Status tone={batch.status === "completed" ? "green" : batch.status.includes("fail") ? "red" : "orange"}>{batch.status.replace("_", " ")}</Status></td><td data-label="Size">{(batch.totalBytes / 1024 / 1024).toFixed(1)} MB</td><td data-label="Notice">{batch.notificationStatus}</td><td data-label="Drive"><a className="table-action" href={`https://drive.google.com/drive/folders/${batch.driveFolderId}`} target="_blank" rel="noreferrer"><Icon name="arrow-right" size={14} />Open Drive<span className="sr-only">, opens in a new tab</span></a></td></tr>)}</tbody></table></div> : <EmptyState title="No batches recorded." detail="Client uploads will appear here after the first transfer is prepared." />}
    </section>
  </AppShell>;
}
