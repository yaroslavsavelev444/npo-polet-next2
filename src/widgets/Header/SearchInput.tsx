'use client';

import { useId, useRef, type FocusEvent } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useSearchStore } from '@/shared/store/search.store';
import { useClickOutside } from '@/shared/hooks/useClickOutside';
import {
  useProductSearch,
  useSearchKeyboard,
  SearchDropdown,
  SEARCH_MIN_QUERY_LENGTH,
} from '@/modules/search';
import { cn } from '@/utils/cn';

interface Props {
  expanded?: boolean;
}

const RESULTS_LISTBOX_ID = 'header-search-results';

export default function SearchInput({ expanded = false }: Props) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useSearchStore((s) => s.query);
  const isOpen = useSearchStore((s) => s.isOpen);
  const loading = useSearchStore((s) => s.loading);
  const results = useSearchStore((s) => s.results);
  const activeIndex = useSearchStore((s) => s.activeIndex);
  const setQuery = useSearchStore((s) => s.setQuery);
  const open = useSearchStore((s) => s.open);
  const close = useSearchStore((s) => s.close);
  const reset = useSearchStore((s) => s.reset);

  // Дебаунс ввода + запрос к /api/search при изменении query
  useProductSearch();

  useClickOutside(containerRef, close, isOpen);

  const handleKeyDown = useSearchKeyboard({ onEscape: close, onSelect: reset });

  const handleClear = () => {
    reset();
    inputRef.current?.focus();
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextFocusTarget = event.relatedTarget as Node | null;
    if (!nextFocusTarget || !containerRef.current?.contains(nextFocusTarget)) {
      close();
    }
  };

  const trimmedLength = query.trim().length;
  const showDropdown = isOpen && trimmedLength > 0;
  const showLoader = loading && trimmedLength >= SEARCH_MIN_QUERY_LENGTH;
  const activeResultId = activeIndex >= 0 ? results[activeIndex]?.id : undefined;

  return (
    <div
      ref={containerRef}
      className={cn('relative', expanded ? 'w-full max-w-[420px]' : 'w-48')}
    >
      <div
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5',
          'px-4 py-2.5 backdrop-blur-xl transition-all',
          'focus-within:border-white/25 focus-within:bg-white/[0.07]',
        )}
      >
        <Search size={18} className="shrink-0 text-neutral-400" aria-hidden />

        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={RESULTS_LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            activeResultId ? `search-result-${activeResultId}` : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={open}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Поиск товаров..."
          className={cn(
            'min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none',
            'placeholder:text-neutral-400',
            '[&::-webkit-search-cancel-button]:appearance-none',
          )}
        />

        {showLoader && (
          <Loader2 size={16} className="shrink-0 animate-spin text-neutral-400" aria-hidden />
        )}

        {!showLoader && query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Очистить поиск"
            className="shrink-0 text-neutral-400 transition-colors hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showDropdown && <SearchDropdown id={RESULTS_LISTBOX_ID} onSelect={reset} />}
    </div>
  );
}