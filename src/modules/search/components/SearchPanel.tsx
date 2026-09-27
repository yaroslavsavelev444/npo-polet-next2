'use client'

import { BookOpen, CircleHelp, Loader2, Package } from 'lucide-react'
import type { CSSProperties } from 'react'
import { toHighlightStems } from '@/modules/knowledge/lib/search'
import { cn } from '@/utils/cn'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_MORE_LIMIT } from '../constants'
import type { useSiteSearch } from '../hooks/useSiteSearch'
import { entryKey, moreKey, optionId, remainingIn } from '../lib/entries'
import type { SearchResultType, SearchSection } from '../types'
import { SearchContentItem } from './SearchContentItem'
import { SearchEmptyState } from './SearchEmptyState'
import { SearchLoadingState } from './SearchLoadingState'
import { SearchResultItem } from './SearchResultItem'

const SECTION_META: Record<SearchResultType, { title: string; icon: typeof Package }> = {
  product: { title: 'Товары', icon: Package },
  knowledge: { title: 'База знаний', icon: BookOpen },
  faq: { title: 'Вопросы и ответы', icon: CircleHelp },
}

interface SearchPanelProps {
  id: string
  /** Текущий текст поля (обрезанный). */
  query: string
  search: ReturnType<typeof useSiteSearch>
  activeKey: string | null
  onHover: (key: string) => void
  onSelect: () => void
  onLoadMore: (type: SearchResultType, offset: number) => void
  /** dropdown — под полем на desktop, sheet — мобильная панель на весь экран. */
  variant: 'dropdown' | 'sheet'
  className?: string
  style?: CSSProperties
}

/**
 * Выдача поиска: секции по типам в порядке релевантности (его считает
 * сервер) и все состояния — подсказка про длину, загрузка, пусто, ошибка.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЕСЛИ РЕЗУЛЬТАТОВ МНОГО
 * ────────────────────────────────────────────────────────────────────────────
 * Каждая секция показывает первую порцию и «Показать ещё N» — догрузку на
 * месте, внутри панели. Страницы «все результаты» нет намеренно: из поиска
 * идут прямо к товару, статье или вопросу, а длинный список внутри панели
 * прокручивается сам. Секции не превращаются в стену: товаров по умолчанию
 * шесть, остальных — по три, и всё прочее — по явной просьбе.
 */
export function SearchPanel({
  id,
  query,
  search,
  activeKey,
  onHover,
  onSelect,
  onLoadMore,
  variant,
  className,
  style,
}: SearchPanelProps) {
  const { data, sections, isBelowMinLength, isLoading, isError, isTyping } = search
  const terms = toHighlightStems(query)

  const hasSections = sections.length > 0
  // Выдача на экране относится к другому запросу (печатают дальше или новый
  // ответ ещё в пути) — приглушаем её, но не убираем: мигание хуже.
  const isOutdated = Boolean(data) && (isTyping || search.isStale || data?.query !== query)
  const showSkeleton = !isBelowMinLength && !isError && !hasSections && (isLoading || isTyping)
  const showEmpty =
    !isBelowMinLength && !isError && !hasSections && Boolean(data) && !isOutdated && !isLoading

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Результаты поиска"
      aria-busy={isLoading || search.isStale || undefined}
      // Нажатие мышью внутри панели не должно уводить фокус с поля: иначе
      // onBlur закрыл бы панель раньше, чем сработает переход по ссылке.
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        variant === 'dropdown' &&
          'overflow-hidden rounded-2xl border border-[var(--text-primary)]/10 bg-[var(--surface)]/95 shadow-2xl backdrop-blur-2xl animate-[dropdown-in_150ms_ease-out]',
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          'overflow-y-auto overscroll-contain p-2',
          variant === 'dropdown' ? 'max-h-[min(70vh,40rem)]' : 'h-full',
        )}
      >
        {isBelowMinLength && (
          <p className="px-3 py-6 text-center text-sm text-[color:var(--text-primary)]/50">
            Введите ещё {SEARCH_MIN_QUERY_LENGTH - query.length}{' '}
            {SEARCH_MIN_QUERY_LENGTH - query.length === 1 ? 'символ' : 'символа'} для поиска
          </p>
        )}

        {isError && (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-sm text-[var(--error)]">Не удалось выполнить поиск. Попробуйте ещё раз.</p>
            <button
              type="button"
              onClick={search.retry}
              className="rounded-full border border-[var(--text-primary)]/15 px-4 py-1.5 text-xs font-medium text-[color:var(--text-primary)]/80 transition-colors hover:bg-[var(--text-primary)]/5"
            >
              Повторить попытку
            </button>
          </div>
        )}

        {!isBelowMinLength && !isError && hasSections && (
          <div
            className={cn(
              'flex flex-col gap-1 transition-opacity duration-200',
              isOutdated && 'opacity-50',
            )}
          >
            {sections.map((section) => (
              <SectionView
                key={section.type}
                section={section}
                terms={terms}
                activeKey={activeKey}
                onHover={onHover}
                onSelect={onSelect}
                onLoadMore={onLoadMore}
                isLoadingMore={search.loadingMore === section.type}
                loadMoreFailed={search.moreError === section.type}
              />
            ))}
          </div>
        )}

        {showSkeleton && <SearchLoadingState />}
        {showEmpty && <SearchEmptyState query={query} />}
      </div>

      {variant === 'dropdown' && hasSections && (
        <div
          aria-hidden
          className="hidden items-center gap-4 border-t border-[var(--text-primary)]/10 px-4 py-2 text-[11px] text-[color:var(--text-primary)]/45 [@media(pointer:fine)]:flex"
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
          </span>
          <span>
            <Kbd>Enter</Kbd> открыть
          </span>
          <span>
            <Kbd>Esc</Kbd> закрыть
          </span>
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-[var(--text-primary)]/15 px-1 font-sans text-[10px]">
      {children}
    </kbd>
  )
}

interface SectionViewProps {
  section: SearchSection
  terms: string[]
  activeKey: string | null
  onHover: (key: string) => void
  onSelect: () => void
  onLoadMore: (type: SearchResultType, offset: number) => void
  isLoadingMore: boolean
  loadMoreFailed: boolean
}

function SectionView({
  section,
  terms,
  activeKey,
  onHover,
  onSelect,
  onLoadMore,
  isLoadingMore,
  loadMoreFailed,
}: SectionViewProps) {
  const meta = SECTION_META[section.type]
  const Icon = meta.icon
  const headingId = `search-section-${section.type}`
  const remaining = remainingIn(section)
  const nextBatch = Math.min(remaining, SEARCH_MORE_LIMIT[section.type])
  const more = moreKey(section.type)

  return (
    <div role="group" aria-labelledby={headingId} className="py-1">
      <div className="flex items-baseline gap-2 px-3 pb-1 pt-2">
        <Icon className="h-3.5 w-3.5 shrink-0 self-center text-[color:var(--text-primary)]/40" aria-hidden />
        <span
          id={headingId}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-primary)]/55"
        >
          {meta.title}
        </span>
        <span className="text-[11px] tabular-nums text-[color:var(--text-primary)]/35">{section.total}</span>
        {section.approximate && (
          <span className="ml-auto text-[11px] text-[var(--warning)]">
            Точных совпадений нет — похожие по написанию
          </span>
        )}
      </div>

      <ul role="presentation" className="flex flex-col gap-0.5">
        {section.type === 'product' &&
          section.items.map((item) => {
            const key = entryKey('product', item)
            return (
              <SearchResultItem
                key={key}
                entryKey={key}
                result={item}
                terms={terms}
                isActive={activeKey === key}
                onHover={onHover}
                onSelect={onSelect}
              />
            )
          })}

        {section.type === 'knowledge' &&
          section.items.map((item) => {
            const key = entryKey('knowledge', item)
            return (
              <SearchContentItem
                key={key}
                kind="knowledge"
                entryKey={key}
                href={item.href}
                title={item.title}
                context={item.categoryTitle}
                snippet={item.snippet}
                terms={terms}
                isActive={activeKey === key}
                onHover={onHover}
                onSelect={onSelect}
              />
            )
          })}

        {section.type === 'faq' &&
          section.items.map((item) => {
            const key = entryKey('faq', item)
            return (
              <SearchContentItem
                key={key}
                kind="faq"
                entryKey={key}
                href={item.href}
                title={item.question}
                context={item.topicTitle}
                snippet={item.snippet}
                terms={terms}
                isActive={activeKey === key}
                onHover={onHover}
                onSelect={onSelect}
              />
            )
          })}

        {remaining > 0 && (
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={activeKey === more}
              id={optionId(more)}
              tabIndex={-1}
              disabled={isLoadingMore}
              onClick={() => onLoadMore(section.type, section.items.length)}
              onMouseMove={() => onHover(more)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors duration-150',
                loadMoreFailed ? 'text-[var(--error)]' : 'text-[color:var(--text-primary)]/65',
                activeKey === more ? 'bg-[var(--text-primary)]/10' : 'hover:bg-[var(--text-primary)]/5',
              )}
            >
              {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {loadMoreFailed
                ? 'Не удалось загрузить — повторить'
                : nextBatch === remaining
                  ? `Показать ещё ${remaining}`
                  : `Показать ещё ${nextBatch} · осталось ${remaining}`}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
