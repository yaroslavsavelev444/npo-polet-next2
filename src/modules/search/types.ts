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

export interface SearchResultProduct {
  id: string
  title: string
  slug: string
  finalPrice: number
  originalPrice: number
  hasDiscount: boolean
  imageUrl: string | null
  imageAlt: string
  category: SearchResultCategory | null
  status: SearchResultStatus
}

export interface SearchApiResponse {
  results: SearchResultProduct[]
  total: number
}