import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_12px_32px_-16px_var(--accent-shadow)] hover:bg-[var(--accent-strong)]",
        secondary: "border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-[var(--accent-muted)] hover:bg-[var(--surface-3)]",
        ghost: "text-[var(--muted-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
        outline: "border border-[var(--line)] bg-transparent text-[var(--foreground)] hover:border-[var(--accent-muted)] hover:bg-[var(--surface-2)]",
        danger: "bg-[var(--danger)] text-white shadow-[0_12px_32px_-16px_var(--danger)] hover:bg-[#ff6d75]",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-8 px-3 text-xs",
        lg: "min-h-12 px-5 text-sm",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
