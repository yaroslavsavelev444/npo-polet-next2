"use client";

import { cn } from "@/utils/cn";
import {
  useState,
  useRef,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from "react";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

const placementStyles: Record<TooltipPlacement, string> = {
  top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left:   "right-full top-1/2 -translate-y-1/2 mr-2",
  right:  "left-full top-1/2 -translate-y-1/2 ml-2",
};

const arrowStyles: Record<TooltipPlacement, string> = {
  top:    "top-full left-1/2 -translate-x-1/2 border-t-[var(--surface-secondary)] border-b-transparent border-l-transparent border-r-transparent",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-[var(--surface-secondary)] border-t-transparent border-l-transparent border-r-transparent",
  left:   "left-full top-1/2 -translate-y-1/2 border-l-[var(--surface-secondary)] border-t-transparent border-b-transparent border-r-transparent",
  right:  "right-full top-1/2 -translate-y-1/2 border-r-[var(--surface-secondary)] border-t-transparent border-b-transparent border-l-transparent",
};

export function Tooltip({
  content,
  placement = "top",
  delay = 200,
  disabled = false,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timer.current = setTimeout(() => setVisible(true), delay);
  }, [disabled, delay]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }, []);

  if (!content) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 pointer-events-none",
            "px-2.5 py-1.5 rounded-[var(--radius-sm)]",
            "bg-[var(--surface-secondary)] border border-[var(--border)]",
            "text-xs text-[var(--text-primary)] leading-tight whitespace-nowrap",
            "shadow-[0_4px_16px_var(--shadow-color)]",
            "animate-in fade-in-0 zoom-in-95 duration-150",
            placementStyles[placement],
            className,
          )}
        >
          {content}
          <span
            aria-hidden
            className={cn(
              "absolute w-0 h-0 border-4",
              arrowStyles[placement],
            )}
          />
        </span>
      )}
    </span>
  );
}

export default Tooltip;