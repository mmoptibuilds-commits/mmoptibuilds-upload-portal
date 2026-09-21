"use client";

import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

/**
 * Adapted from Aceternity UI's Aurora Background component.
 * Source: https://ui.aceternity.com/components/aurora-background
 */
export function AuroraBackground({ className, children, showRadialGradient = true, ...props }: AuroraBackgroundProps) {
  return (
    <div className="relative isolate min-h-full">
      <div className={cn("relative flex min-h-full flex-col items-center justify-center overflow-hidden bg-[var(--background)] text-[var(--foreground)]", className)} {...props}>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className={cn(
              "after:animate-aurora absolute -inset-[10px] bg-[image:var(--white-gradient),var(--aurora)] bg-[length:300%,_200%] bg-[position:50%_50%,50%_50%] opacity-45 blur-[10px] invert filter will-change-transform after:absolute after:inset-0 after:bg-[image:var(--white-gradient),var(--aurora)] after:bg-[length:200%,_100%] after:bg-fixed after:mix-blend-difference after:content-[''] dark:bg-[image:var(--dark-gradient),var(--aurora)] dark:invert-0 after:dark:bg-[image:var(--dark-gradient),var(--aurora)]",
              showRadialGradient && "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]",
            )}
            style={{
              "--aurora": "repeating-linear-gradient(100deg,#2563eb 10%,#a5b4fc 15%,#67e8f9 20%,#ddd6fe 25%,#38bdf8 30%)",
              "--dark-gradient": "repeating-linear-gradient(100deg,#05070b 0%,#05070b 7%,transparent 10%,transparent 12%,#05070b 16%)",
              "--white-gradient": "repeating-linear-gradient(100deg,#fff 0%,#fff 7%,transparent 10%,transparent 12%,#fff 16%)",
            } as React.CSSProperties}
          />
        </div>
        <div className="relative z-10 w-full">{children}</div>
      </div>
    </div>
  );
}
