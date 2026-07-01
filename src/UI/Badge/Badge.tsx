import { cn } from "@/utils/cn";
import type { BadgeProps } from "./Badge.types";

const variantStyles = {
  default:  "bg-[var(--surface-secondary)] text-[var(--text-secondary)]",
  primary:  "bg-[var(--primary)]/15 text-[var(--primary)]",
  success:  "bg-[var(--success)]/15 text-[var(--success)]",
  warning:  "bg-[var(--warning)]/15 text-[var(--warning)]",
  danger:   "bg-[var(--error)]/15 text-[var(--error)]",
  accent:   "bg-[var(--accent)]/15 text-[var(--accent)]",
  outline:  "bg-transparent border border-[var(--border)] text-[var(--text-secondary)]",
};

const dotColors = {
  default: "bg-[var(--text-muted)]",
  primary: "bg-[var(--primary)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger:  "bg-[var(--error)]",
  accent:  "bg-[var(--accent)]",
  outline: "bg-[var(--text-muted)]",
};

const sizeStyles = {
  sm: "text-xs px-2 py-0.5 rounded-full",
  md: "text-xs px-2.5 py-1 rounded-full",
};

export function Badge({
  variant = "default",
  size = "sm",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium leading-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

export default Badge;