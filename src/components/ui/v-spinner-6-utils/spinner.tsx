import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" className={cn("spinner", className)} {...props}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32 18" /></svg>;
}
