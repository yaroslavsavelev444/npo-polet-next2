'use client'

import { useEffect, type RefObject } from 'react'

export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutsideClick: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node | null
      if (target && ref.current && !ref.current.contains(target)) {
        onOutsideClick()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ref, onOutsideClick, enabled])
}