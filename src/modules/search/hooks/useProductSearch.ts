'use client'

import { useEffect, useRef } from 'react'
import { useDebouncedValue } from './useDebouncedValue'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_DEBOUNCE_MS } from '../constants'
import type { SearchApiResponse } from '../types'
import { useSearchStore } from '@/shared/store/search.store'

/**
 * Оркестрация загрузки результатов поиска:
 * - дебаунс ввода
 * - отмена устаревших запросов через AbortController (защита от гонок)
 * - обработка ошибок сети с возможностью ретрая
 */
export function useProductSearch(): void {
  const query = useSearchStore((s) => s.query)
  const retryToken = useSearchStore((s) => s.retryToken)
  const setResults = useSearchStore((s) => s.setResults)
  const setLoading = useSearchStore((s) => s.setLoading)
  const setError = useSearchStore((s) => s.setError)

  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortControllerRef.current?.abort()

    if (debouncedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)

    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Search request failed with status ${res.status}`)
        return (await res.json()) as SearchApiResponse
      })
      .then((data) => {
        setResults(data.results ?? [])
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('[useProductSearch] fetch error:', error)
        setResults([])
        setError('Не удалось выполнить поиск. Попробуйте ещё раз.')
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [debouncedQuery, retryToken, setResults, setLoading, setError])
}