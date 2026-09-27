import { create } from 'zustand'

/**
 * Состояние поля поиска в шапке — только интерфейс.
 *
 * Сами результаты здесь не хранятся: их держит React Query (useSiteSearch) —
 * с кэшем по запросу, отменой устаревших запросов и повтором после ошибки.
 * Раньше стор вёл результаты, загрузку и ошибку вручную, и всё это
 * приходилось синхронизировать с AbortController самостоятельно.
 */
interface SearchState {
  query: string
  isOpen: boolean
  /** Ключ выделенного результата (`${type}-${id}`), а не индекс: индекс
   *  съезжает, когда «Показать ещё» дописывает строки в середину списка. */
  activeKey: string | null

  setQuery: (query: string) => void
  setActiveKey: (key: string | null) => void
  open: () => void
  close: () => void
  reset: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  isOpen: false,
  activeKey: null,

  setQuery: (query) => set({ query, activeKey: null }),
  setActiveKey: (activeKey) => set({ activeKey }),

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, activeKey: null }),

  reset: () => set({ query: '', isOpen: false, activeKey: null }),
}))
