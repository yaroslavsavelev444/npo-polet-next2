"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

type DrawerPlacement = "left" | "right" | "top" | "bottom";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  placement?: DrawerPlacement;
  /** px для left/right, или vh% для top/bottom */
  size?: number | string;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

const placementBase: Record<DrawerPlacement, string> = {
  right:  "inset-y-0 right-0 h-full",
  left:   "inset-y-0 left-0 h-full",
  top:    "inset-x-0 top-0 w-full",
  bottom: "inset-x-0 bottom-0 w-full",
};

const translateHidden: Record<DrawerPlacement, string> = {
  right:  "translate-x-full",
  left:   "-translate-x-full",
  top:    "-translate-y-full",
  bottom: "translate-y-full",
};

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  placement = "right",
  size = 420,
  closeOnOverlay = true,
  closeOnEscape = true,
  className,
}: DrawerProps) {
  // Escape
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, closeOnEscape, onClose]);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Портал в document.body недоступен при SSR. Раньше это проверялось через
  // `typeof window === "undefined"` прямо в рендере — сервер рендерил null,
  // а клиент на первом же проходе гидратации уже видел window и сразу
  // рендерил портал, из-за чего React ловил hydration mismatch. mounted
  // выставляется в эффекте, то есть ПОСЛЕ гидратации — на ней оба прохода
  // (сервер и первый клиентский рендер) синхронно возвращают null.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const drawerSize =
    placement === "left" || placement === "right"
      ? { width: typeof size === "number" ? `${size}px` : size }
      : { height: typeof size === "number" ? `${size}px` : size };

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "drawer-title" : undefined}
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Overlay */}
      <div
        aria-hidden
        onClick={closeOnOverlay ? onClose : undefined}
        className={cn(
          "absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Panel */}
      <div
        style={drawerSize}
        className={cn(
          "absolute flex flex-col",
          "bg-[var(--surface)] border-[var(--border)]",
          placement === "right" && "border-l",
          placement === "left"  && "border-r",
          placement === "top"   && "border-b",
          placement === "bottom"&& "border-t",
          placementBase[placement],
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0 translate-y-0" : translateHidden[placement],
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          {title && (
            <h2
              id="drawer-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className={cn(
              "ml-auto -mr-1 flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)]",
              "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]",
              "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
            )}
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;