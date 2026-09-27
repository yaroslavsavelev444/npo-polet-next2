'use client'

import Link from 'next/link'
import { BookOpen, CircleHelp } from 'lucide-react'
import { cn } from '@/utils/cn'
import { HighlightedText } from '@/modules/knowledge/components/HighlightedText'
import { optionId } from '../lib/entries'

interface SearchContentItemProps {
  kind: 'knowledge' | 'faq'
  href: string
  title: string
  /** Раздел базы знаний или тема FAQ. */
  context: string | null
  snippet: string | null
  entryKey: string
  terms: string[]
  isActive: boolean
  onHover: (key: string) => void
  onSelect: () => void
}

/**
 * Статья базы знаний или вопрос FAQ. Геометрия та же, что у строки товара
 * (значок на месте фото), чтобы секции читались одной колонкой; под
 * заголовком — где это лежит и фрагмент текста, по которому нашлось.
 */
export function SearchContentItem({
  kind,
  href,
  title,
  context,
  snippet,
  entryKey,
  terms,
  isActive,
  onHover,
  onSelect,
}: SearchContentItemProps) {
  const Icon = kind === 'knowledge' ? BookOpen : CircleHelp

  return (
    <li role="presentation">
      <Link
        href={href}
        role="option"
        aria-selected={isActive}
        id={optionId(entryKey)}
        tabIndex={-1}
        onClick={onSelect}
        onMouseMove={() => onHover(entryKey)}
        className={cn(
          'flex items-start gap-3 rounded-xl px-3 py-2 transition-colors duration-150',
          isActive ? 'bg-[var(--text-primary)]/10' : 'hover:bg-[var(--text-primary)]/5',
        )}
      >
        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/5 text-[color:var(--text-primary)]/50">
          <Icon className="h-4 w-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--text-primary)]">
            <HighlightedText text={title} terms={terms} />
          </p>
          {context && (
            <p className="mt-0.5 truncate text-xs text-[color:var(--text-primary)]/50">{context}</p>
          )}
          {snippet && (
            <p className="mt-0.5 line-clamp-1 text-xs text-[color:var(--text-primary)]/60">
              <HighlightedText text={snippet} terms={terms} />
            </p>
          )}
        </div>
      </Link>
    </li>
  )
}
