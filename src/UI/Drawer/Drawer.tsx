"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

  // Возврат фокуса после закрытия.
  //
  // Обязателен именно из-за inert: закрытая панель исключена из обхода, и
  // фокус, оставшийся внутри неё, оказывается в подветке, которой для
  // клавиатуры больше не существует. Дальше Tab начинает обход с начала
  // документа — то есть пользователь теряет место, где был.
  //
  // Внутрь панели при открытии фокус НЕ уводится: это осознанно оставлено как
  // было, чтобы не менять поведение трёх существующих мест использования.
  // Кнопка, которой панель открыли, и так получает фокус нажатием, поэтому
  // возврат к ней — восстановление исходного положения, а не перенос.
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    const restore = restoreFocusRef.current;
    restoreFocusRef.current = null;
    // Элемент мог исчезнуть вместе с перерисовкой — тогда фокус остаётся там,
    // где был, а не улетает на <body>.
    if (restore?.isConnected) restore.focus({ preventScroll: true });
  }, [open]);

  // Портал в document.body недоступен при SSR. Раньше это проверялось через
  // `typeof window === "undefined"` прямо в рендере — сервер рендерил null,
  // а клиент на первом же проходе гидратации уже видел window и сразу
  // рендерил портал, из-за чего React ловил hydration mismatch. mounted
  // выставляется в эффекте, то есть ПОСЛЕ гидратации — на ней оба прохода
  // (сервер и первый клиентский рендер) синхронно возвращают null.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Идентификатор заголовка обязан быть УНИКАЛЬНЫМ. Раньше здесь стояла
  // строковая константа "drawer-title", и это ломалось ровно там, где на
  // странице живёт больше одной панели: в каталоге одновременно смонтированы
  // «Фильтры» и «Сортировка», то есть в документе оказывалось два элемента с
  // одним id. aria-labelledby у обеих панелей резолвился в ПЕРВЫЙ из них, и
  // сортировка представлялась скринридеру как «Фильтры».
  const titleId = useId();

  const drawerSize =
    placement === "left" || placement === "right"
      ? { width: typeof size === "number" ? `${size}px` : size }
      : { height: typeof size === "number" ? `${size}px` : size };

  if (!mounted) return null;

  return createPortal(
    // Панель ОСТАЁТСЯ в DOM и в закрытом состоянии — иначе оборвётся анимация
    // ухода (см. transition-transform ниже). Но «присутствует в разметке» и
    // «существует для пользователя» — разные вещи, и раньше они были склеены:
    //
    //   • aria-modal="true" висел всегда. Для скринридера это значит «всё
    //     остальное на странице недоступно», поэтому на любой странице с
    //     панелью (каталог монтирует сразу две) содержимое за её пределами
    //     могло скрываться целиком — при том что визуально никакой панели нет.
    //
    //   • Содержимое закрытой панели оставалось в порядке обхода: pointer-events
    //     отключают мышь, но не Tab. Проходя каталог с клавиатуры, пользователь
    //     проваливался в невидимые «Фильтры» и «Сортировку».
    //
    // inert решает обе задачи разом: подветка исключается и из дерева
    // доступности, и из обхода табом, и из попадания курсором. aria-modal при
    // этом всё равно снимается — на случай браузера без поддержки inert
    // (до Safari 15.5 / Firefox 112) модальная семантика не должна оставаться
    // включённой у закрытой панели.
    <div
      role="dialog"
      aria-modal={open || undefined}
      aria-labelledby={title ? titleId : undefined}
      inert={!open}
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
              id={titleId}
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