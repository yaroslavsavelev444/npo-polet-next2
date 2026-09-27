'use client'

import { useEffect, type RefObject } from 'react'

/**
 * `ref` может быть списком: элемент, вынесенный порталом (например,
 * выпадающая панель поиска), в DOM лежит вне своего поля, но «снаружи» для
 * него не является.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  onOutsideClick: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node | null
      if (!target) return
      const refs = Array.isArray(ref) ? ref : [ref]
      const inside = refs.some((item) => item.current?.contains(target))
      if (!inside && refs.some((item) => item.current)) onOutsideClick()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ref, onOutsideClick, enabled])
}