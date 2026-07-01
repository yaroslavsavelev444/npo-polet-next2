"use client";

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** px — undefined = auto width */
  width?: number | string;
  /** Закрыть при клике на оверлей */
  closeOnOverlay?: boolean;
  /** Закрыть при Escape */
  closeOnEscape?: boolean;
  className?: string;
  /** Вызывается после полного закрытия анимации */
  afterClose?: () => void;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  closeOnOverlay = true,
  closeOnEscape = true,
  className,
  afterClose,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Синхронизируем состояние с нативным <dialog>
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
      afterClose?.();
    }
  }, [open, afterClose]);

  // Нативный Escape браузера закрывает dialog — перехватываем и делегируем в onClose
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handle = (e: Event) => {
      e.preventDefault();
      if (closeOnEscape) onClose();
    };
    el.addEventListener("cancel", handle);
    return () => el.removeEventListener("cancel", handle);
  }, [closeOnEscape, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (!closeOnOverlay) return;
      // Клик попал на сам <dialog> (оверлей), а не на дочерний контент
      if (e.target === dialogRef.current) onClose();
    },
    [closeOnOverlay, onClose],
  );

  const widthStyle =
    typeof width === "number" ? `${width}px` : width;

  if (typeof window === "undefined") return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className={cn(
        // Сброс стилей браузера
        "m-auto max-h-[90vh] overflow-hidden p-0 bg-transparent border-none outline-none",
        // Оверлей через ::backdrop (стилизуем через глобальный CSS — см. ниже)
        "open:flex",
        "backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-sm",
      )}
      style={{ width: widthStyle, maxWidth: "calc(100vw - 32px)" }}
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div
        className={cn(
          "relative flex flex-col w-full max-h-[90vh]",
          "bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)]",
          "shadow-[0_24px_64px_rgba(0,0,0,0.5)]",
          className,
        )}
      >
        {/* Header */}
        {(title || true) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--border)] shrink-0">
            {title && (
              <h2
                id="modal-title"
                className="text-base font-semibold text-[var(--text-primary)] leading-snug"
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
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-[var(--text-primary)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

export default Modal;