// services/discounts.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { Discount } from '@/payload-types'
import type { Where } from 'payload'

export interface GetDiscountsOptions {
  isActive?: boolean
  type?: 'percentage' | 'fixed' | 'quantity_based'
  code?: string
  startAt_gte?: string
  endAt_lte?: string
  appliesToAllProducts?: boolean
  applicableCategory?: string
  applicableProduct?: string
  priority_gte?: number
  priority_lte?: number
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildDiscountsWhere(options: GetDiscountsOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.isActive !== undefined) {
    conditions.push({ isActive: { equals: options.isActive } })
  }
  if (options.type) {
    conditions.push({ type: { equals: options.type } })
  }
  if (options.code) {
    conditions.push({ code: { equals: options.code } })
  }
  if (options.startAt_gte) {
    conditions.push({ startAt: { greater_than_equal: options.startAt_gte } })
  }
  if (options.endAt_lte) {
    conditions.push({ endAt: { less_than_equal: options.endAt_lte } })
  }
  if (options.appliesToAllProducts !== undefined) {
    conditions.push({ appliesToAllProducts: { equals: options.appliesToAllProducts } })
  }
  if (options.applicableCategory) {
    conditions.push({ applicableCategories: { contains: options.applicableCategory } })
  }
  if (options.applicableProduct) {
    conditions.push({ applicableProducts: { contains: options.applicableProduct } })
  }
  if (options.priority_gte !== undefined) {
    conditions.push({ priority: { greater_than_equal: options.priority_gte } })
  }
  if (options.priority_lte !== undefined) {
    conditions.push({ priority: { less_than_equal: options.priority_lte } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getDiscountsCacheKey(options?: GetDiscountsOptions): string {
  const {
    isActive,
    type,
    code,
    startAt_gte,
    endAt_lte,
    appliesToAllProducts,
    applicableCategory,
    applicableProduct,
    priority_gte,
    priority_lte,
    sort,
    limit,
    page,
    depth,
  } = options || {}
  return `discounts-active-${isActive ?? 'any'}-type-${type || 'any'}-code-${code || 'any'}-start-${startAt_gte || 'any'}-end-${endAt_lte || 'any'}-allprod-${appliesToAllProducts ?? 'any'}-cat-${applicableCategory || 'any'}-prod-${applicableProduct || 'any'}-pgte-${priority_gte ?? 'any'}-plte-${priority_lte ?? 'any'}-sort-${sort || 'priority'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchDiscounts(options: GetDiscountsOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildDiscountsWhere(options)
  const result = await payload.find({
    collection: 'discounts',
    where,
    sort: options.sort || 'priority',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as Discount[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedDiscounts = (options?: GetDiscountsOptions) => {
  const fetchFn = () => fetchDiscounts(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getDiscountsCacheKey(options)],
    { tags: ['discounts'], revalidate: false }
  )()
}

async function fetchDiscountById(id: string): Promise<Discount | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'discounts',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Discount | null
}

export const getCachedDiscountById = (id: string) => {
  const fetchFn = () => fetchDiscountById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`discount-${id}`],
    { tags: ['discounts'], revalidate: false }
  )()
}

async function fetchDiscountByCode(code: string): Promise<Discount | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'discounts',
    where: { code: { equals: code } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Discount | null
}

export const getCachedDiscountByCode = (code: string) => {
  const fetchFn = () => fetchDiscountByCode(code)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`discount-code-${code}`],
    { tags: ['discounts'], revalidate: false }
  )()
}