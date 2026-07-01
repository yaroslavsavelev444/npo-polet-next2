import type { Media, Product } from '@/payload-types'
import { mapDiscountPercentage, calculatePriceBreakdown } from '@/modules/productCard'
import type { SearchResultProduct } from '../types'

function isPopulatedMedia(value: unknown): value is Media {
  return typeof value === 'object' && value !== null
}

/**
 * Product (Payload, depth: 1) -> SearchResultProduct (вью-модель дропдауна поиска).
 * Расчёт цены/скидки переиспользует логику из modules/productCard, чтобы цена
 * в поиске всегда совпадала с ценой на карточке товара.
 */
export function mapProductToSearchResult(product: Product): SearchResultProduct {
  const category =
    typeof product.category === 'object' && product.category !== null
      ? {
          id: String(product.category.id),
          slug: product.category.slug,
          name: product.category.name,
        }
      : null

  const firstImage = product.images?.[0]
  const media = isPopulatedMedia(firstImage) ? firstImage : null

  const originalPrice = product.pricing?.priceForIndividual ?? 0
  const discountInfo = mapDiscountPercentage(product.pricing?.discount, originalPrice)
  const { finalPrice, hasDiscount } = calculatePriceBreakdown(originalPrice, {
    isActive: discountInfo.isActive,
    percentage: discountInfo.percentage,
  })

  return {
    id: String(product.id),
    title: product.title,
    slug: product.slug ?? '',
    finalPrice,
    originalPrice,
    hasDiscount,
    imageUrl: media?.sizes?.thumbnail?.url || media?.url || null,
    imageAlt: media?.alt || product.title,
    category,
    status: product.inventory?.status ?? 'available',
  }
}