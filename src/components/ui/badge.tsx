import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none tracking-wide", {
  variants: {
    variant: {
      default: "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]",
      success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success)]",
      warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning)]",
      danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]",
      muted: "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted-strong)]",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
