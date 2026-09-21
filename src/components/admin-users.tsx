"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { CustodyStrip, Icon, RippleButton, Status } from "@/components/ui";
import { fetchWithTimeout } from "@/lib/async-timeouts";

type User = {
  id: string;
  username: string;
  role: "user" | "admin";
  enabled: boolean;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
  batchCount: number;
  totalBytes: number;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function displayDate(value: string | Date | null) {
  return value ? dateFormatter.format(new Date(value)) : "Never";
}

export function AdminUsers({ initialUsers, initialHasMore }: { initialUsers: User[]; initialHasMore: boolean }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "user", enabled: true });
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const [disableTarget, setDisableTarget] = useState<User | null>(null);
  const resetInput = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const busyRef = useRef<string | null>(null);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const open = Boolean(resetTarget || disableTarget);
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]") ?? []).filter((element) => !element.hasAttribute("disabled"));
    const focusFrame = requestAnimationFrame(() => (resetTarget ? resetInput.current?.focus() : focusable()[0]?.focus()));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        if (resetTarget) setResetTarget(null);
        else setDisableTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [resetTarget?.id, disableTarget?.id]);

  async function load(search = q, offset = 0, append = false) {
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`/api/admin/users?q=${encodeURIComponent(search)}&offset=${offset}`, {}, 15_000, "Loading accounts");
      const data = await response.json().catch(() => null);
      if (!response.ok) setMessage(data?.error || "Accounts could not be loaded.");
      else {
        setUsers((current) => append ? [...current, ...data.users] : data.users);
        setHasMore(Boolean(data.hasMore));
      }
    } catch {
      setMessage("Accounts could not be loaded. Check the connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setMessage("");
    try {
      const response = await fetchWithTimeout("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }, 20_000, "Creating the account");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error || "The account could not be created.");
        return;
      }
      setForm({ username: "", password: "", role: "user", enabled: true });
      setMessage(`Created ${data.user.username}.`);
      await load();
    } catch {
      setMessage("The account could not be created. Check the connection and retry.");
    } finally {
      setBusy(null);
    }
  }

  async function patch(id: string, body: object) {
    setBusy(id);
    setMessage("");
    try {
      const response = await fetchWithTimeout(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 20_000, "Updating the account");
      const data = await response.json().catch(() => null);
      if (!response.ok) setMessage(data?.error || "The account could not be updated.");
      else {
        setMessage(`Updated ${data.user.username}.`);
        await load();
      }
    } catch {
      setMessage("The account could not be updated. Check the connection and retry.");
    } finally {
      setBusy(null);
    }
  }

  function toggleEnabled(user: User) {
    if (user.enabled) {
      setDisableTarget(user);
      return;
    }
    void patch(user.id, { enabled: true });
  }

  function openReset(user: User) {
    setResetTarget(user);
    setResetPassword("");
    setResetError("");
    setShowResetPassword(false);
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 10) {
      setResetError("Use at least 10 characters.");
      return;
    }
    setBusy(`reset:${resetTarget.id}`);
    setResetError("");
    try {
      const response = await fetchWithTimeout(`/api/admin/users/${resetTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: resetPassword }) }, 20_000, "Resetting the password");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setResetError(data?.error || "The password could not be reset.");
        return;
      }
      setResetTarget(null);
      setResetPassword("");
      setMessage(`Password reset for ${data.user.username}. Active sessions were revoked.`);
      await load();
    } catch {
      setResetError("The password could not be reset. Check the connection and retry.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="admin-users">
    <header className="page-header">
      <div><CustodyStrip route="USERS">ACL:PRIVATE ▦ SESSIONS:REVOCABLE ▦ PASSWORDS:WRITE-ONLY</CustodyStrip><span className="eyebrow">ACCESS CONTROL</span><h1>User management</h1><p>Create private accounts, control access, and revoke active sessions when credentials change.</p></div>
    </header>
    <section className="user-admin-grid">
      <form className="create-user material-surface" onSubmit={create}>
        <span className="eyebrow">CREATE ACCOUNT</span>
        <h2>Provision access</h2>
        <label>Username<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} pattern="[a-z0-9._-]{2,64}" autoComplete="off" required /></label>
        <label>Initial password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} autoComplete="new-password" required /><small>Minimum 10 characters.</small></label>
        <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "user" | "admin" })}><option value="user">Client user</option><option value="admin">Administrator</option></select></label>
        <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /><span />Enable this account now</label>
        <RippleButton className="button-primary" type="submit" aria-busy={busy === "create"} disabled={busy !== null}>{busy === "create" ? "Creating…" : "Create user"}<Icon name="arrow-right" size={16} /></RippleButton>
      </form>
      <section className="material-surface users-table" aria-labelledby="directory-title">
        <div className="panel-head"><div><span className="eyebrow">DIRECTORY</span><h2 id="directory-title">Accounts</h2></div><form className="search" onSubmit={(e) => { e.preventDefault(); void load(); }}><label className="sr-only" htmlFor="user-search">Search username</label><input id="user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username" /><button type="submit" aria-label="Search users" disabled={loading}><Icon name="search" size={16} /></button></form></div>
        {message && <p className="queue-message" role="status" aria-live="polite">{message}</p>}
        <div className="table-wrap"><table className="responsive-table"><caption className="sr-only">Private user accounts</caption><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Uploads</th><th>Last login</th><th>Action</th></tr></thead><tbody>{loading && !users.length ? <tr><td colSpan={6}>Loading accounts…</td></tr> : users.map((user) => <tr key={user.id}><td data-label="User"><b>{user.username}</b><small>Created {displayDate(user.createdAt)}</small></td><td data-label="Role">{user.role}</td><td data-label="Status"><Status tone={user.enabled ? "green" : "red"}>{user.enabled ? "enabled" : "disabled"}</Status></td><td data-label="Uploads">{user.batchCount}</td><td data-label="Last login">{displayDate(user.lastLoginAt)}</td><td data-label="Action"><div className="table-actions"><button className="table-action" type="button" disabled={busy !== null} onClick={() => toggleEnabled(user)}>{user.enabled ? "Disable" : "Enable"}</button><button className="table-action" type="button" disabled={busy !== null} onClick={() => openReset(user)}>Reset password</button></div></td></tr>)}</tbody></table></div>
        {hasMore && <div className="table-more"><button className="button button-secondary" type="button" disabled={loading} onClick={() => void load(q, users.length, true)}>{loading ? "Loading more…" : "Load more accounts"}</button></div>}
      </section>
    </section>
    {resetTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setResetTarget(null); }}><section ref={modalRef} className="modal material-glass" role="dialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description"><span className="eyebrow">RESET CREDENTIALS</span><h2 id="reset-title">Set a new password</h2><p id="reset-description">Resetting <b>{resetTarget.username}</b> revokes all active sessions for that account.</p><form onSubmit={reset}><label className="password-field" htmlFor="reset-password">New password<input ref={resetInput} id="reset-password" type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={10} autoComplete="new-password" required /><button type="button" onClick={() => setShowResetPassword((visible) => !visible)}>{showResetPassword ? "Hide" : "Show"}</button></label><small className="field-help">Use at least 10 characters and share it through a private channel.</small>{resetError && <p className="form-error" role="alert">{resetError}</p>}<div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => setResetTarget(null)}>Cancel</button><RippleButton className="button-primary" type="submit" aria-busy={busy === `reset:${resetTarget.id}`} disabled={busy !== null}>{busy === `reset:${resetTarget.id}` ? "Resetting…" : "Reset password"}</RippleButton></div></form></section></div>}
    {disableTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDisableTarget(null); }}><section ref={modalRef} className="modal material-glass" role="dialog" aria-modal="true" aria-labelledby="disable-title" aria-describedby="disable-description"><span className="eyebrow">REVOKE ACCESS</span><h2 id="disable-title">Disable {disableTarget.username}?</h2><p id="disable-description">This immediately revokes the account’s active sessions. The account can be enabled again later.</p><div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => setDisableTarget(null)}>Keep enabled</button><RippleButton className="button-primary" type="button" disabled={busy !== null} onClick={() => { setDisableTarget(null); void patch(disableTarget.id, { enabled: false }); }}>Disable account</RippleButton></div></section></div>}
  </div>;
}
