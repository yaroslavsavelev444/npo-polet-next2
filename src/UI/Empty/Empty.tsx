import { cn } from "@/utils/cn";
import type { ReactNode } from "react";

export type EmptySize = "sm" | "md" | "lg";

export interface EmptyProps {
  message?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: EmptySize;
  /** Кнопки / действия */
  children?: ReactNode;
  className?: string;
}

const sizeStyles: Record<EmptySize, { icon: string; message: string; gap: string }> = {
  sm: { icon: "w-16 h-16", message: "text-sm",  gap: "gap-3" },
  md: { icon: "w-24 h-24", message: "text-sm",  gap: "gap-4" },
  lg: { icon: "w-32 h-32", message: "text-base", gap: "gap-5" },
};

// Default SVG icon — минималистичный "пустой ящик"
function DefaultIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="10" y="32" width="60" height="38" rx="4" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M10 44h18l6 8h12l6-8h18" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M28 20l4-10h16l4 10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Empty({
  message = "Здесь пока ничего нет",
  description,
  icon,
  size = "md",
  children,
  className,
}: EmptyProps) {
  const s = sizeStyles[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        s.gap,
        className,
      )}
    >
      <span className={cn("text-[var(--border-light)]", s.icon)}>
        {icon ?? <DefaultIcon className="w-full h-full" />}
      </span>

      <div className="flex flex-col items-center gap-1.5">
        <p className={cn("font-medium text-[var(--text-secondary)]", s.message)}>
          {message}
        </p>
        {description && (
          <p className="text-xs text-[var(--text-muted)] max-w-[260px] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {children && (
        <div className="flex flex-col items-center gap-2 mt-1">{children}</div>
      )}
    </div>
  );
}

export default Empty;