"use client";
import { type ButtonHTMLAttributes, type PropsWithChildren, type ReactNode, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

export function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
export function formatDuration(seconds: number) { if (!Number.isFinite(seconds) || seconds < 1) return "Calculating"; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return m ? `${m}m ${s}s` : `${s}s`; }

export function RippleButton({ children, className = "", onPointerDown, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  const ref = useRef<HTMLButtonElement>(null); const reduce = useReducedMotion();
  return <motion.button ref={ref} className={`button ${className}`} whileHover={reduce ? undefined : { scale: 1.025, y: -1 }} whileTap={reduce ? undefined : { scale: 0.97 }} onPointerDown={(event) => {
    if (!reduce && ref.current) { const el = document.createElement("span"); const rect = ref.current.getBoundingClientRect(); el.className = "ripple"; el.style.left = `${event.clientX - rect.left}px`; el.style.top = `${event.clientY - rect.top}px`; ref.current.append(el); el.addEventListener("animationend", () => el.remove()); }
    onPointerDown?.(event);
  }} {...(props as unknown as Record<string, unknown>)}>{children}</motion.button>;
}
export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) { return <span className={`status status-${tone}`}><i />{children}</span>; }
export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-mark">M</div><h2>{title}</h2><p>{detail}</p>{action}</div>; }
export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) { return <article className="metric"><p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}</article>; }
