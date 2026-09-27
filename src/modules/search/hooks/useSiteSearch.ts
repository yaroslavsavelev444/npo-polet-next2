'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_QUERY_LENGTH } from '../constants'
import type {
  SearchResponse,
  SearchResultType,
  SearchSection,
  SearchSectionPageResponse,
} from '../types'
import { useDebouncedValue } from './useDebouncedValue'

export const searchKeys = {
  all: ['site-search'] as const,
  query: (q: string) => ['site-search', q] as const,
  section: (q: string, type: SearchResultType, offset: number) =>
    ['site-search', q, type, offset] as const,
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Search request failed: ${response.status}`)
  return (await response.json()) as T
}

type Extra = Partial<Record<SearchResultType, SearchSection['items']>>

/**
 * Данные поиска в шапке.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СКОЛЬКО ЗАПРОСОВ УХОДИТ НА СЕРВЕР
 * ────────────────────────────────────────────────────────────────────────────
 *  • дебаунс: запрос уходит после паузы в наборе, а не на каждую букву;
 *  • короче SEARCH_MIN_QUERY_LENGTH — не уходит вовсе;
 *  • React Query кэширует ответ по строке запроса: стёр букву и вернул её —
 *    ответ берётся из памяти (и ещё раньше — из кэша браузера, см. route);
 *  • устаревший запрос отменяется: queryFn получает signal, и когда ключ
 *    сменился, React Query обрывает прежний fetch — ответ на «вул» не может
 *    прийти позже ответа на «вултур» и затереть его.
 *
 * Пока идёт новый запрос, на экране остаётся прежняя выдача (placeholderData)
 * — приглушённая, а не заменённая скелетоном: иначе панель мигала бы на
 * каждой паузе в наборе.
 */
export function useSiteSearch(rawQuery: string) {
  const queryClient = useQueryClient()
  const trimmed = rawQuery.trim()
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS)
  const enabled = debounced.length >= SEARCH_MIN_QUERY_LENGTH

  const result = useQuery({
    queryKey: searchKeys.query(debounced),
    queryFn: ({ signal }) =>
      getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(debounced)}`, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  })

  // Догруженные «Показать ещё» строки — по секциям. Сбрасываются вместе со
  // сменой запроса: состояние привязано к строке, для которой получено.
  const [more, setMore] = useState<{ query: string; extra: Extra }>({
    query: debounced,
    extra: {},
  })
  const [loadingMore, setLoadingMore] = useState<SearchResultType | null>(null)
  const [moreError, setMoreError] = useState<SearchResultType | null>(null)
  const extra = more.query === debounced ? more.extra : {}

  const data = enabled ? result.data : undefined
  const sections: SearchSection[] = (data?.sections ?? []).map((section) => {
    const appended = extra[section.type]
    return appended
      ? ({ ...section, items: [...section.items, ...appended] } as SearchSection)
      : section
  })

  const loadMore = useCallback(
    async (type: SearchResultType, offset: number) => {
      setLoadingMore(type)
      setMoreError(null)
      try {
        const page = await queryClient.fetchQuery({
          queryKey: searchKeys.section(debounced, type, offset),
          queryFn: ({ signal }) =>
            getJson<SearchSectionPageResponse>(
              `/api/search?q=${encodeURIComponent(debounced)}&type=${type}&offset=${offset}`,
              signal,
            ),
          staleTime: 60_000,
        })
        setMore((current) => {
          const base = current.query === debounced ? current.extra : {}
          return {
            query: debounced,
            extra: {
              ...base,
              [type]: [...(base[type] ?? []), ...page.section.items],
            },
          }
        })
      } catch {
        setMoreError(type)
      } finally {
        setLoadingMore(null)
      }
    },
    [debounced, queryClient],
  )

  return {
    /** Запрос ещё не ушёл: пользователь печатает. */
    isTyping: trimmed !== debounced,
    isBelowMinLength: trimmed.length > 0 && trimmed.length < SEARCH_MIN_QUERY_LENGTH,
    enabled,
    data,
    sections,
    /** Показанная выдача относится к прежнему запросу, новый ещё грузится. */
    isStale: result.isPlaceholderData || (enabled && result.isFetching && Boolean(data)),
    isLoading: enabled && result.isPending,
    // Ошибка текущего запроса важнее прежней выдачи: показывать под новым
    // запросом старые результаты как ответ на него — значит обманывать.
    isError: enabled && result.isError,
    retry: () => void result.refetch(),
    loadMore,
    loadingMore,
    moreError,
  }
}
