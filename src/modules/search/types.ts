export interface SearchResultCategory {
  id: string
  slug: string
  name: string
}

export type SearchResultStatus =
  | 'available'
  | 'preorder'
  | 'out_of_stock'
  | 'discontinued'

/** Источник результата. Порядок секций в выдаче считает сервер (см. lib/ranking). */
export type SearchResultType = 'product' | 'knowledge' | 'faq'

export interface SearchResultProduct {
  id: string
  title: string
  slug: string
  /** Готовая ссылка на карточку — та же, что строит productCard. */
  href: string
  finalPrice: number
  originalPrice: number
  hasDiscount: boolean
  imageUrl: string | null
  imageAlt: string
  category: SearchResultCategory | null
  status: SearchResultStatus
  /**
   * Характеристика, по которой нашёлся товар, если совпадение было в ней, а
   * не в названии. Без неё результат «Вултур P10v2» на запрос «IP67»
   * выглядел бы случайным.
   */
  matchedSpec: { name: string; value: string; unit: string | null } | null
}

export interface SearchResultKnowledge {
  id: string
  title: string
  href: string
  categoryTitle: string | null
  /** Фрагмент текста статьи вокруг совпадения, либо её описание. */
  snippet: string | null
}

export interface SearchResultFaq {
  id: string
  question: string
  /** /faq#<якорь вопроса> — страница FAQ сама раскрывает вопрос по якорю. */
  href: string
  topicTitle: string
  snippet: string | null
}

interface SectionBase {
  /** Сколько всего найдено в этом источнике (для «Показать ещё»). */
  total: number
  /**
   * Точных совпадений нет, показаны похожие по написанию (опечатка в
   * запросе). Интерфейс обязан об этом сказать.
   */
  approximate: boolean
}

export type SearchSection =
  | (SectionBase & { type: 'product'; items: SearchResultProduct[] })
  | (SectionBase & { type: 'knowledge'; items: SearchResultKnowledge[] })
  | (SectionBase & { type: 'faq'; items: SearchResultFaq[] })

export type SearchResultItem = SearchSection['items'][number]

/** Ответ GET /api/search?q=… — первые порции всех источников. */
export interface SearchResponse {
  query: string
  /** Непустые секции в порядке релевантности. */
  sections: SearchSection[]
  total: number
}

/** Ответ GET /api/search?q=…&type=…&offset=… — следующая порция одной секции. */
export interface SearchSectionPageResponse {
  section: SearchSection
}
