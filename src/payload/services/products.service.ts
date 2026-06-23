// services/products.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { Product } from '@/payload-types'
import type { Where } from 'payload'

export interface GetProductsOptions {
  category?: string
  status?: 'available' | 'preorder' | 'out_of_stock' | 'discontinued'
  isVisible?: boolean
  showOnMainPage?: boolean
  sku?: string
  minPrice?: number
  maxPrice?: number
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildProductsWhere(options: GetProductsOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.category) {
    conditions.push({ category: { equals: options.category } })
  }
  if (options.status) {
    conditions.push({ status: { equals: options.status } })
  }
  if (options.isVisible !== undefined) {
    conditions.push({ isVisible: { equals: options.isVisible } })
  }
  if (options.showOnMainPage !== undefined) {
    conditions.push({ showOnMainPage: { equals: options.showOnMainPage } })
  }
  if (options.sku) {
    conditions.push({ sku: { equals: options.sku } })
  }
  if (options.minPrice !== undefined) {
    conditions.push({ priceForIndividual: { greater_than_equal: options.minPrice } })
  }
  if (options.maxPrice !== undefined) {
    conditions.push({ priceForIndividual: { less_than_equal: options.maxPrice } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getProductsCacheKey(options?: GetProductsOptions): string {
  const {
    category,
    status,
    isVisible,
    showOnMainPage,
    sku,
    minPrice,
    maxPrice,
    sort,
    limit,
    page,
    depth,
  } = options || {}
  return `products-cat-${category || 'any'}-st-${status || 'any'}-vis-${isVisible ?? 'any'}-main-${showOnMainPage ?? 'any'}-sku-${sku || 'any'}-pmin-${minPrice ?? 'any'}-pmax-${maxPrice ?? 'any'}-sort-${sort || 'title'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchProducts(options: GetProductsOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildProductsWhere(options)
  const result = await payload.find({
    collection: 'products',
    where,
    sort: options.sort || 'title',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as Product[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedProducts = (options?: GetProductsOptions) => {
  const fetchFn = () => fetchProducts(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getProductsCacheKey(options)],
    { tags: ['products'], revalidate: false }
  )()
}

async function fetchProductById(id: string): Promise<Product | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'products',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Product | null
}

export const getCachedProductById = (id: string) => {
  const fetchFn = () => fetchProductById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`product-${id}`],
    { tags: ['products'], revalidate: false }
  )()
}

async function fetchProductBySku(sku: string): Promise<Product | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'products',
    where: { sku: { equals: sku } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Product | null
}

export const getCachedProductBySku = (sku: string) => {
  const fetchFn = () => fetchProductBySku(sku)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`product-sku-${sku}`],
    { tags: ['products'], revalidate: false }
  )()
}