import { create } from 'zustand'
import type { SearchResultProduct } from '@/modules/search/types'

interface SearchState {
  query: string
  isOpen: boolean
  loading: boolean
  error: string | null
  results: SearchResultProduct[]
  activeIndex: number
  /** Инкрементируется кнопкой "Повторить попытку" — форсирует рефетч без изменения query */
  retryToken: number

  setQuery: (query: string) => void
  setResults: (results: SearchResultProduct[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setActiveIndex: (index: number) => void
  moveActiveIndex: (direction: 1 | -1) => void
  open: () => void
  close: () => void
  reset: () => void
  retry: () => void
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  isOpen: false,
  loading: false,
  error: null,
  results: [],
  activeIndex: -1,
  retryToken: 0,

  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results, activeIndex: -1 }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),

  moveActiveIndex: (direction) => {
    const { results, activeIndex } = get()
    if (results.length === 0) return
    const next = (activeIndex + direction + results.length) % results.length
    set({ activeIndex: next })
  },

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, activeIndex: -1 }),

  reset: () =>
    set({
      query: '',
      isOpen: false,
      loading: false,
      error: null,
      results: [],
      activeIndex: -1,
    }),

  retry: () => set((s) => ({ retryToken: s.retryToken + 1 })),
}))