import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 1) return "Calculating";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "orange" | "red" }) {
  const variant = tone === "green" ? "success" : tone === "orange" ? "warning" : tone === "red" ? "danger" : tone === "blue" ? "default" : "muted";
  return <Badge variant={variant} className={`status status-${tone}`}>{children}</Badge>;
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <Card className="empty-state"><FolderOpen aria-hidden="true" size={22} strokeWidth={1.6} /><h2>{title}</h2><p>{detail}</p>{action}</Card>;
}

export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <Card className="metric"><p>{label}</p><strong>{value}</strong>{detail && <span>{detail}</span>}</Card>;
}
