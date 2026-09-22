import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notificationEvents } from "@/lib/db/schema";
import { getOptionalConfig } from "@/lib/env";
import { AppShell } from "@/components/app-shell";
import { EmptyState, Metric, Status } from "@/components/ui";

export default async function Diagnostics() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/upload");

  const [events, config] = await Promise.all([db().select().from(notificationEvents).orderBy(desc(notificationEvents.createdAt)).limit(20), Promise.resolve(getOptionalConfig())]);
  const state = (ready: boolean) => ready ? "Ready" : "Needs attention";

  return <AppShell user={user}>
    <header className="page-header"><div><h1>System status</h1><p>Configuration readiness and recent notification events. Secret values are never displayed.</p></div></header>
    <section className="metric-grid"><Metric label="Database" value={state(config.database)} /><Metric label="Authentication" value={state(config.auth)} /><Metric label="Private storage" value={state(config.storage)} /><Metric label="Email notifications" value={config.email ? "Ready" : "Not configured"} /></section>
    <section className="admin-panel material-surface" aria-labelledby="notification-events-title"><div className="panel-head"><h2 id="notification-events-title">Recent notification events</h2></div>{events.length ? <ul className="diagnostic-list">{events.map((event) => <li key={event.id}><Status tone={event.status.includes("fail") ? "red" : "green"}>{event.status}</Status><span>{event.error || "Completed without an error."}</span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(event.createdAt)}</time></li>)}</ul> : <EmptyState title="No notification events" detail="Notification events will appear here when email delivery is attempted." />}</section>
  </AppShell>;
}
