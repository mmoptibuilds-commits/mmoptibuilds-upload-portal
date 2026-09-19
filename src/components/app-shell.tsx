"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { RippleButton } from "@/components/ui";
export function AppShell({ children, user }: { children: React.ReactNode; user: { username: string; role: string } }) {
  const path = usePathname(); const router = useRouter(); const [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); try { await fetch("/api/auth/logout", { method: "POST" }); } finally { router.push("/login"); router.refresh(); } }
  const links = user.role === "admin" ? [["Overview", "/admin"], ["Upload batches", "/admin/uploads"], ["Users", "/admin/users"], ["Diagnostics", "/admin/diagnostics"], ["Client portal", "/upload"]] : [["Upload", "/upload"], ["History", "/history"]];
  return <main className="app-frame"><aside className="side-nav"><Link className="brand-lockup" aria-label="mmoptibuilds home" href={user.role === "admin" ? "/admin" : "/upload"}><b>MM</b><span>mmoptibuilds<small>ENGINEERED PERFORMANCE</small></span></Link><nav aria-label="Primary navigation">{links.map(([label, href]) => <Link key={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined} href={href}>{label}</Link>)}</nav><RippleButton type="button" aria-label="Log out" aria-busy={loggingOut} className="button-quiet mobile-logout" disabled={loggingOut} onClick={logout}>↗</RippleButton><div className="account"><span className="avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span><div><b>{user.username}</b><small>{user.role}</small></div><RippleButton type="button" aria-label="Log out" aria-busy={loggingOut} className="button-quiet" disabled={loggingOut} onClick={logout}>↗</RippleButton></div></aside><section className="app-content">{children}</section></main>;
}
