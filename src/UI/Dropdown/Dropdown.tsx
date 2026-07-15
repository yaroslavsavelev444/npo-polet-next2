"use client";

import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DropdownItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  /** Разделитель перед этим элементом */
  dividerBefore?: boolean;
}

export interface DropdownProps {
  items: DropdownItem[];
  children: ReactNode;
  /** Ключ выбранного элемента (для controlled-режима) */
  selectedKey?: string;
  onSelect?: (key: string) => void;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  disabled?: boolean;
  className?: string;
  menuClassName?: string;
}

const placementStyles = {
  "bottom-start": "top-full left-0 mt-1",
  "bottom-end":   "top-full right-0 mt-1",
  "top-start":    "bottom-full left-0 mb-1",
  "top-end":      "bottom-full right-0 mb-1",
};

export function Dropdown({
  items,
  children,
  selectedKey,
  onSelect,
  placement = "bottom-start",
  disabled = false,
  className,
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabledItems = items.filter((i) => !i.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  // Закрыть при клике вне
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, close]);

  const handleSelect = useCallback(
    (key: string) => {
      onSelect?.(key);
      close();
    },
    [onSelect, close],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      switch (e.key) {
        case "Enter":
        case " ":
          if (!open) { setOpen(true); setFocusedIndex(0); e.preventDefault(); }
          else if (focusedIndex >= 0) {
            handleSelect(enabledItems[focusedIndex].key);
            e.preventDefault();
          }
          break;
        case "ArrowDown":
          if (!open) { setOpen(true); setFocusedIndex(0); }
          else setFocusedIndex((i) => Math.min(i + 1, enabledItems.length - 1));
          e.preventDefault();
          break;
        case "ArrowUp":
          setFocusedIndex((i) => Math.max(i - 1, 0));
          e.preventDefault();
          break;
        case "Escape":
          close();
          break;
        case "Tab":
          close();
          break;
      }
    },
    [open, focusedIndex, enabledItems, disabled, handleSelect, close],
  );

  useEffect(() => {
    if (open && focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, open]);

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex", className)}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(disabled && "pointer-events-none opacity-50")}
      >
        {children}
      </div>

      {/* Menu */}
      {open && (
        <ul
          role="listbox"
          aria-activedescendant={
            focusedIndex >= 0 ? `dd-item-${enabledItems[focusedIndex]?.key}` : undefined
          }
          className={cn(
            "absolute z-50 min-w-[160px] py-1",
            "bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)]",
            "shadow-[0_8px_32px_var(--shadow-color)]",
            "animate-in fade-in-0 zoom-in-95 duration-150 origin-top-left",
            placementStyles[placement],
            menuClassName,
          )}
        >
          {items.map((item, idx) => {
            const enabledIdx = enabledItems.findIndex((i) => i.key === item.key);
            return (
              <Fragment key={item.key}>
                {item.dividerBefore && (
                  <li aria-hidden className="h-px bg-[var(--border)] my-1 mx-2" />
                )}
                <li role="option" aria-selected={selectedKey === item.key}>
                  <button
                    id={`dd-item-${item.key}`}
                    ref={(el) => { if (enabledIdx >= 0) itemRefs.current[enabledIdx] = el; }}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => !item.disabled && handleSelect(item.key)}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm text-left",
                      "transition-colors duration-100 focus-visible:outline-none",
                      item.danger
                        ? "text-[var(--error)] hover:bg-[var(--error)]/10"
                        : "text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] focus:bg-[var(--surface-secondary)]",
                      item.disabled && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    {item.icon && <span className="shrink-0 text-[var(--text-muted)]">{item.icon}</span>}
                    <span className="flex-1">{item.label}</span>
                    {selectedKey === item.key && (
                      <Check className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Dropdown;