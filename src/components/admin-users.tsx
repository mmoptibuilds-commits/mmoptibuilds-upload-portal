"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon, RippleButton, Status } from "@/components/ui";

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

export function AdminUsers({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "user", enabled: true });
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState("");
  const resetInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resetTarget) resetInput.current?.focus();
  }, [resetTarget]);

  async function load(search = q) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) setMessage(data?.error || "Accounts could not be loaded.");
      else setUsers(data.users);
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
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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
      const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    if (user.enabled && !window.confirm(`Disable ${user.username}? Their active sessions will be revoked.`)) return;
    void patch(user.id, { enabled: !user.enabled });
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
      const response = await fetch(`/api/admin/users/${resetTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: resetPassword }) });
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
      <div><span className="eyebrow">ACCESS CONTROL</span><h1>User management</h1><p>Create private accounts, control access, and revoke active sessions when credentials change.</p></div>
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
        <div className="table-wrap"><table className="responsive-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Uploads</th><th>Last login</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}>Loading accounts…</td></tr> : users.map((user) => <tr key={user.id}><td data-label="User"><b>{user.username}</b><small>Created {displayDate(user.createdAt)}</small></td><td data-label="Role">{user.role}</td><td data-label="Status"><Status tone={user.enabled ? "green" : "red"}>{user.enabled ? "enabled" : "disabled"}</Status></td><td data-label="Uploads">{user.batchCount}</td><td data-label="Last login">{displayDate(user.lastLoginAt)}</td><td data-label="Action"><div className="table-actions"><button className="table-action" type="button" disabled={busy !== null} onClick={() => toggleEnabled(user)}>{user.enabled ? "Disable" : "Enable"}</button><button className="table-action" type="button" disabled={busy !== null} onClick={() => openReset(user)}>Reset password</button></div></td></tr>)}</tbody></table></div>
      </section>
    </section>
    {resetTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setResetTarget(null); }}><section className="modal material-glass" role="dialog" aria-modal="true" aria-labelledby="reset-title" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setResetTarget(null); }}><span className="eyebrow">RESET CREDENTIALS</span><h2 id="reset-title">Set a new password</h2><p>Resetting <b>{resetTarget.username}</b> revokes all active sessions for that account.</p><form onSubmit={reset}><label className="password-field" htmlFor="reset-password">New password<input ref={resetInput} id="reset-password" type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={10} autoComplete="new-password" required /><button type="button" onClick={() => setShowResetPassword((visible) => !visible)}>{showResetPassword ? "Hide" : "Show"}</button></label><small className="field-help">Use at least 10 characters and share it through a private channel.</small>{resetError && <p className="form-error" role="alert">{resetError}</p>}<div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => setResetTarget(null)}>Cancel</button><RippleButton className="button-primary" type="submit" aria-busy={busy === `reset:${resetTarget.id}`} disabled={busy !== null}>{busy === `reset:${resetTarget.id}` ? "Resetting…" : "Reset password"}</RippleButton></div></form></section></div>}
  </div>;
}
