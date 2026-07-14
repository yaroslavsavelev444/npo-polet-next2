'use client';

import { cn } from '@/utils/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface CircleIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

/**
 * Circular translucent icon button used for overlay actions on top of media
 * (wishlist toggle, quick view). Shared so every overlay action gets the
 * same size, blur, and restrained hover feedback instead of each caller
 * hand-rolling its own absolute-positioned button.
 */
export function CircleIconButton({
  active = false,
  className,
  children,
  ...props
}: CircleIconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'bg-[var(--surface)]/90 text-[var(--text-secondary)] backdrop-blur-sm',
        'shadow-[0_2px_10px_var(--shadow-color)] transition-all duration-150 ease-out',
        'hover:scale-105 hover:text-[var(--text-primary)]',
        'disabled:pointer-events-none disabled:opacity-50',
        active && 'text-[var(--error)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export default CircleIconButton;
