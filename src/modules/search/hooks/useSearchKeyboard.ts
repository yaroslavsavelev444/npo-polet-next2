'use client'

import { useCallback, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchStore } from '@/shared/store/search.store'
import { getSearchResultHref } from '../lib/routing'

interface UseSearchKeyboardOptions {
  onEscape: () => void
  onSelect: () => void
}

export function useSearchKeyboard({ onEscape, onSelect }: UseSearchKeyboardOptions) {
  const router = useRouter()

  return useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
        event.currentTarget.blur()
        return
      }

      // Читаем состояние императивно — не подписываемся, чтобы не создавать лишних ре-рендеров
      const { results, activeIndex, moveActiveIndex, isOpen } = useSearchStore.getState()

      if (!isOpen || results.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveActiveIndex(1)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveActiveIndex(-1)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const index = activeIndex >= 0 ? activeIndex : 0
        const selected = results[index]
        if (!selected) return

        router.push(getSearchResultHref(selected))
        onSelect()
      }
    },
    [router, onEscape, onSelect],
  )
}