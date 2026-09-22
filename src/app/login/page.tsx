"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { RedirectingLoader } from "@/components/ui/v-spinner-6";
import { fetchWithTimeout } from "@/lib/async-timeouts";

type LoginPhase = "idle" | "submitting" | "redirecting";

export default function LoginPage() {
  const reduce = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<"username" | "password" | "form" | null>(null);
  const [phase, setPhase] = useState<LoginPhase>("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (phase !== "idle") return;

    setError("");
    setInvalidField(null);
    if (!username.trim()) {
      setError("Enter your username.");
      setInvalidField("username");
      document.getElementById("username")?.focus();
      return;
    }
    if (!password) {
      setError("Enter your password.");
      setInvalidField("password");
      document.getElementById("password")?.focus();
      return;
    }

    setPhase("submitting");
    try {
      const response = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, remember }),
      }, 15_000, "Signing in");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error || "Sign-in could not be completed.");
        setInvalidField("form");
        setPhase("idle");
        document.getElementById("password")?.focus();
        return;
      }
      if (data?.role !== "admin" && data?.role !== "user") {
        setError("Sign-in response was invalid. Please try again.");
        setInvalidField("form");
        setPhase("idle");
        return;
      }

      setPhase("redirecting");
      const destination = data.role === "admin" ? "/admin" : "/upload";
      window.setTimeout(() => window.location.replace(destination), reduce ? 0 : 240);
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
      setInvalidField("form");
      setPhase("idle");
    }
  }

  const submitting = phase === "submitting";
  const describedBy = error ? "login-help login-error" : "login-help";

  return <main className="login-page-shell" aria-labelledby={phase === "redirecting" ? "redirecting-heading" : "login-heading"}>
    <div className="login-dot-field" aria-hidden="true" />
    <div className="login-brand" aria-label="mmoptibuilds"><span>mm</span><b>mmoptibuilds</b></div>
    {phase === "redirecting" ? <div className="redirecting-screen"><h1 id="redirecting-heading" className="sr-only">Setting up your workspace</h1><RedirectingLoader /></div> : <motion.section className="login-card" initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
      <header className="login-heading">
        <p>Client upload portal</p>
        <h1 id="login-heading">Sign in to upload files</h1>
        <span id="login-help">Use the username and password provided by mmoptibuilds.</span>
      </header>
      <form onSubmit={submit} noValidate aria-describedby={describedBy}>
        <label className="field-label" htmlFor="username">Username
          <input id="username" value={username} onChange={(event) => { setUsername(event.target.value); if (invalidField === "username") { setInvalidField(null); setError(""); } }} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" aria-invalid={invalidField === "username" || undefined} aria-describedby={error ? "login-error" : undefined} required />
        </label>
        <label className="field-label password-label" htmlFor="password">Password
          <span className="password-input-wrap"><input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); if (invalidField === "password") { setInvalidField(null); setError(""); } }} onKeyUp={(event) => setCaps(event.getModifierState("CapsLock"))} onKeyDown={(event) => setCaps(event.getModifierState("CapsLock"))} autoComplete="current-password" aria-invalid={invalidField === "password" || undefined} aria-describedby={error ? "login-error" : undefined} required /><button className="password-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
        </label>
        {caps && <p className="field-note warning" role="status">Caps Lock is on.</p>}
        <label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span aria-hidden="true" />Remember this device for 30 days</label>
        {error && <p id="login-error" className="form-error" role="alert">{error}</p>}
        <button className="button button-primary login-submit" type="submit" aria-busy={submitting} disabled={submitting}>{submitting ? <><LoaderCircle className="spinner" size={16} aria-hidden="true" />Signing in…</> : <>Sign in<ArrowRight size={16} aria-hidden="true" /></>}</button>
      </form>
      <p className="login-footer">Access is invitation-only.</p>
    </motion.section>}
  </main>;
}
