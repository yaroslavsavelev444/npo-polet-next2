import type { SearchResultItem, SearchResultType, SearchSection } from '../types.ts'

/**
 * Пункт выдачи в том порядке, в каком его обходят стрелками: результат
 * (ведёт по ссылке) или «Показать ещё» в конце секции (догружает её).
 * Кнопка — такой же пункт, а не отдельная остановка табом: иначе с
 * клавиатуры до неё пришлось бы выбираться из поля ввода.
 */
export type SearchEntry =
  | { key: string; kind: 'link'; href: string }
  | { key: string; kind: 'more'; type: SearchResultType; offset: number }

export function entryKey(type: SearchResultType, item: SearchResultItem): string {
  return `${type}-${item.id}`
}

export function moreKey(type: SearchResultType): string {
  return `more-${type}`
}

/** Сколько строк секции ещё не показано. */
export function remainingIn(section: SearchSection): number {
  return Math.max(0, section.total - section.items.length)
}

/** Все пункты подряд — секция за секцией, как они стоят на экране. */
export function flattenSections(sections: SearchSection[]): SearchEntry[] {
  return sections.flatMap((section): SearchEntry[] => {
    const items: SearchEntry[] = (section.items as SearchResultItem[]).map((item) => ({
      key: entryKey(section.type, item),
      kind: 'link',
      href: item.href,
    }))
    if (remainingIn(section) > 0) {
      items.push({
        key: moreKey(section.type),
        kind: 'more',
        type: section.type,
        offset: section.items.length,
      })
    }
    return items
  })
}

/**
 * Следующий выделенный пункт при нажатии стрелки. По кругу: вниз с
 * последнего — на первый, вверх с первого (или когда ничего не выделено) —
 * на последний. Так было и в прежнем выпадающем списке.
 */
export function moveActiveKey(
  entries: SearchEntry[],
  activeKey: string | null,
  direction: 1 | -1,
): string | null {
  if (entries.length === 0) return null
  const index = entries.findIndex((entry) => entry.key === activeKey)
  if (index === -1) return direction === 1 ? entries[0].key : entries[entries.length - 1].key
  return entries[(index + direction + entries.length) % entries.length].key
}

/**
 * Что открывает Enter: выделенный пункт, а если ничего не выделено — первый
 * результат (как в прежнем списке: набрал «вултур», нажал Enter — попал на
 * лучший товар).
 */
export function resolveEnterTarget(
  entries: SearchEntry[],
  activeKey: string | null,
): SearchEntry | null {
  const active = entries.find((entry) => entry.key === activeKey)
  if (active) return active
  return entries.find((entry) => entry.kind === 'link') ?? null
}

/** DOM-id пункта — для aria-activedescendant. */
export function optionId(key: string): string {
  return `search-option-${key}`
}
