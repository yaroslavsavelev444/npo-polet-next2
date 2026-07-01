// src/UI/Modal/Modal.tsx
'use client'

import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { RemoveScroll } from 'react-remove-scroll' // <-- новый импорт
import { cn } from '@/utils/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number | string
  closeOnOverlay?: boolean
  closeOnEscape?: boolean
  className?: string
  afterClose?: () => void
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
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Синхронизация open/close
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else {
      if (el.open) el.close()
      afterClose?.()
    }
  }, [open, afterClose])

  // Перехват Escape
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const handle = (e: Event) => {
      e.preventDefault()
      if (closeOnEscape) onClose()
    }
    el.addEventListener('cancel', handle)
    return () => el.removeEventListener('cancel', handle)
  }, [closeOnEscape, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (!closeOnOverlay) return
      if (e.target === dialogRef.current) onClose()
    },
    [closeOnOverlay, onClose],
  )

  const widthStyle = typeof width === 'number' ? `${width}px` : width

  if (!mounted) return null

  return createPortal(
    <RemoveScroll enabled={open}> {/* Обёртка для блокировки скролла */}
      <dialog
        ref={dialogRef}
        onClick={handleBackdropClick}
        className={cn(
          'm-auto max-h-[90vh] overflow-hidden p-0 bg-transparent border-none outline-none',
          'open:flex',
          'backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-sm',
        )}
        style={{ width: widthStyle, maxWidth: 'calc(100vw - 32px)' }}
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        <div
          className={cn(
            'relative flex flex-col w-full max-h-[90vh]',
            'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)]',
            'shadow-[0_24px_64px_rgba(0,0,0,0.5)]',
            className,
          )}
        >
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
                className="ml-auto -mr-1 flex items-center justify-center w-8 h-8 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-[var(--text-primary)]">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] shrink-0">
              {footer}
            </div>
          )}
        </div>
      </dialog>
    </RemoveScroll>,
    document.body,
  )
}