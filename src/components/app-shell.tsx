"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RippleButton } from "@/components/ui";
export function AppShell({ children, user }: { children: React.ReactNode; user: { username: string; role: string } }) {
  const path = usePathname(); const router = useRouter();
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  const links = user.role === "admin" ? [["Overview", "/admin"], ["Upload batches", "/admin/uploads"], ["Users", "/admin/users"], ["Diagnostics", "/admin/diagnostics"], ["Client portal", "/upload"]] : [["Upload", "/upload"], ["History", "/history"]];
  return <main className="app-frame"><aside className="side-nav"><Link className="brand-lockup" href={user.role === "admin" ? "/admin" : "/upload"}><b>MM</b><span>mmoptibuilds<small>ENGINEERED PERFORMANCE</small></span></Link><nav>{links.map(([label, href]) => <Link key={href} className={path === href ? "active" : ""} href={href}>{label}</Link>)}</nav><div className="account"><span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span><div><b>{user.username}</b><small>{user.role}</small></div><RippleButton aria-label="Log out" className="button-quiet" onClick={logout}>↗</RippleButton></div></aside><section className="app-content">{children}</section></main>;
}
