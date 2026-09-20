"use client";
import { type ButtonHTMLAttributes, type PropsWithChildren, type ReactNode, type SVGProps, useRef } from "react";
import { useReducedMotion } from "motion/react";

export function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
export function formatDuration(seconds: number) { if (!Number.isFinite(seconds) || seconds < 1) return "Calculating"; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return m ? `${m}m ${s}s` : `${s}s`; }

export type IconName = "activity" | "arrow-right" | "check" | "file" | "folder" | "log-out" | "pause" | "play" | "search" | "shield" | "upload" | "users" | "x";

const iconPaths: Record<IconName, ReactNode> = {
  activity: <><path d="M3 12h4l2.2-7 4.1 14L16 12h5" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h5" /></>,
  folder: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /></>,
  "log-out": <><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" /><path d="M13 8l4 4-4 4M17 12H9" /></>,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  play: <path d="m8 5 11 7-11 7z" />,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>,
  shield: <><path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v4h14v-4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 5" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>{iconPaths[name]}</svg>;
}

export function RippleButton({ children, className = "", onPointerDown, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  const ref = useRef<HTMLButtonElement>(null); const reduce = useReducedMotion();
  return <button ref={ref} className={`button ${className}`} onPointerDown={(event) => {
    if (!reduce && ref.current) { const el = document.createElement("span"); const rect = ref.current.getBoundingClientRect(); el.className = "ripple"; el.style.left = `${event.clientX - rect.left}px`; el.style.top = `${event.clientY - rect.top}px`; ref.current.append(el); el.addEventListener("animationend", () => el.remove()); }
    onPointerDown?.(event);
  }} {...props}>{children}</button>;
}
export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) { return <span className={`status status-${tone}`}><i />{children}</span>; }
export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-mark">M</div><h2>{title}</h2><p>{detail}</p>{action}</div>; }
export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) { return <article className="metric"><p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}</article>; }
