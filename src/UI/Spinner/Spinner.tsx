import { cn } from "@/utils/cn";
import type { HTMLAttributes } from "react";

type SpinnerSize = "xs" | "sm" | "md" | "lg";
type SpinnerColor = "primary" | "accent" | "white" | "muted";

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  color?: SpinnerColor;
  label?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "w-3 h-3 border-[1.5px]",
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-9 h-9 border-[3px]",
};

const colorStyles: Record<SpinnerColor, string> = {
  primary: "border-[var(--primary)] border-t-transparent",
  accent:  "border-[var(--accent)] border-t-transparent",
  white:   "border-white border-t-transparent",
  muted:   "border-[var(--border-light)] border-t-transparent",
};

export function Spinner({
  size = "md",
  color = "primary",
  label = "Загрузка...",
  className,
  ...props
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <span
        className={cn(
          "rounded-full animate-spin",
          sizeStyles[size],
          colorStyles[color],
        )}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default Spinner;