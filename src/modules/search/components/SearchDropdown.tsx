'use client'

import { cn } from '@/utils/cn'
import { useSearchStore } from '@/shared/store/search.store'
import { SearchResultItem } from './SearchResultItem'
import { SearchLoadingState } from './SearchLoadingState'
import { SearchEmptyState } from './SearchEmptyState'
import { SEARCH_MIN_QUERY_LENGTH } from '../constants'

interface SearchDropdownProps {
  id: string
  onSelect: () => void
}

export function SearchDropdown({ id, onSelect }: SearchDropdownProps) {
  const query = useSearchStore((s) => s.query.trim())
  const loading = useSearchStore((s) => s.loading)
  const error = useSearchStore((s) => s.error)
  const results = useSearchStore((s) => s.results)
  const activeIndex = useSearchStore((s) => s.activeIndex)
  const retry = useSearchStore((s) => s.retry)

  const isBelowMinLength = query.length > 0 && query.length < SEARCH_MIN_QUERY_LENGTH
  const hasResults = results.length > 0
  // Skeleton показываем только когда результатов ещё нет вообще — иначе при
  // каждом keystroke дропдаун бы моргал. Старые результаты во время повторной
  // загрузки просто приглушаются.
  const showSkeleton = !isBelowMinLength && loading && !hasResults
  const showError = !isBelowMinLength && !loading && Boolean(error) && !hasResults
  const showEmpty = !isBelowMinLength && !loading && !error && !hasResults

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Результаты поиска товаров"
      className="
        absolute left-0 right-0 top-[calc(100%+8px)] z-50
        overflow-hidden rounded-2xl border border-white/10
        bg-[#1f252e]/95 shadow-2xl backdrop-blur-2xl
        animate-[dropdown-in_150ms_ease-out]
      "
    >
      <div className="max-h-[70vh] overflow-y-auto p-2">
        {isBelowMinLength && (
          <p className="px-3 py-6 text-center text-sm text-white/50">
            Введите ещё {SEARCH_MIN_QUERY_LENGTH - query.length}{' '}
            {SEARCH_MIN_QUERY_LENGTH - query.length === 1 ? 'символ' : 'символа'} для поиска
          </p>
        )}

        {hasResults && (
          <ul
            className={cn(
              'flex flex-col gap-0.5 transition-opacity duration-200',
              loading && 'pointer-events-none opacity-50',
            )}
          >
            {results.map((result, index) => (
              <SearchResultItem
                key={result.id}
                result={result}
                index={index}
                isActive={activeIndex === index}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}

        {showSkeleton && <SearchLoadingState />}

        {showError && (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--error)]">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5"
            >
              Повторить попытку
            </button>
          </div>
        )}

        {showEmpty && <SearchEmptyState query={query} />}
      </div>
    </div>
  )
}