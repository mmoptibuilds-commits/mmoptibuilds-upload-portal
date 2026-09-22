"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Files, History, LayoutDashboard, LogOut, Menu, Upload, Users, type LucideIcon } from "lucide-react";

type NavigationItem = { label: string; href: string; icon: LucideIcon };

export function AppShell({ children, user }: { children: React.ReactNode; user: { username: string; role: string } }) {
  const path = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sideNavRef = useRef<HTMLElement>(null);
  const restoreMenuFocus = useRef(false);
  const links: NavigationItem[] = user.role === "admin"
    ? [{ label: "Overview", href: "/admin", icon: LayoutDashboard }, { label: "Upload batches", href: "/admin/uploads", icon: Files }, { label: "Users", href: "/admin/users", icon: Users }, { label: "System status", href: "/admin/diagnostics", icon: Activity }, { label: "Client portal", href: "/upload", icon: ArrowUpRight }]
    : [{ label: "Upload", href: "/upload", icon: Upload }, { label: "Upload history", href: "/history", icon: History }];
  const activeLink = links.find((link) => path === link.href || (link.href !== "/admin" && path.startsWith(`${link.href}/`)));

  async function logout() {
    setLoggingOut(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch("/api/auth/logout", { method: "POST", signal: controller.signal, cache: "no-store", keepalive: true });
    } catch {
      // Navigation below clears protected UI if a network request cannot finish.
    } finally {
      window.clearTimeout(timeout);
      window.location.replace("/login");
    }
  }

  function closeMenu(returnFocus = false) {
    restoreMenuFocus.current = returnFocus;
    setMenuOpen(false);
  }

  function toggleMenu() {
    if (menuOpen) {
      closeMenu(true);
      return;
    }
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) {
      if (restoreMenuFocus.current) {
        menuButtonRef.current?.focus();
        restoreMenuFocus.current = false;
      }
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      sideNavRef.current?.querySelector<HTMLElement>("a, button:not([disabled])")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return <div className="app-frame">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <button ref={menuButtonRef} className="mobile-menu-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-controls="primary-navigation" aria-expanded={menuOpen} onClick={toggleMenu}><Menu size={20} /></button>
    {menuOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => closeMenu(true)} />}
    <aside ref={sideNavRef} className={`side-nav ${menuOpen ? "is-open" : ""}`} aria-label="Application navigation">
      <Link prefetch={false} className="brand-lockup" aria-label="mmoptibuilds home" href={user.role === "admin" ? "/admin" : "/upload"} onClick={() => closeMenu()}><span>mm</span><b>mmoptibuilds</b></Link>
      <nav id="primary-navigation" aria-label="Primary navigation">{links.map(({ label, href, icon: Icon }) => {
        const active = path === href || (href !== "/admin" && path.startsWith(`${href}/`));
        return <Link prefetch={false} key={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} href={href} onClick={() => closeMenu()}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></Link>;
      })}</nav>
      <div className="account"><span className="avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span><div><b>{user.username}</b><small>{user.role}</small></div><button type="button" className="icon-button" aria-label="Log out" title="Log out" aria-busy={loggingOut} disabled={loggingOut} onClick={logout}><LogOut size={17} /></button></div>
    </aside>
    <main className="app-content" id="main-content"><div className="shell-context"><span>{activeLink?.label ?? "Client upload portal"}</span><span>{user.role === "admin" ? "Administrator" : "Client"}</span></div>{children}</main>
  </div>;
}
