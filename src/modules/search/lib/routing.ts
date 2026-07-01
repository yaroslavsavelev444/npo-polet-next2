import { getProductHref } from '@/modules/productCard'
import type { SearchResultProduct } from '../types'

/** Единая точка построения ссылки на товар — переиспользует роутинг productCard. */
export function getSearchResultHref(result: SearchResultProduct): string {
  return getProductHref({
    id: result.id,
    category: result.category
      ? { id: result.category.id, slug: result.category.slug, title: result.category.name }
      : null,
  })
}