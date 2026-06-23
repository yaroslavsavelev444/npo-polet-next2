// services/wishlists.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { Wishlist } from '@/payload-types'
import type { Where } from 'payload'

export interface GetWishlistsOptions {
  user?: string
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildWishlistsWhere(options: GetWishlistsOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.user) {
    conditions.push({ user: { equals: options.user } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getWishlistsCacheKey(options?: GetWishlistsOptions): string {
  const { user, sort, limit, page, depth } = options || {}
  return `wishlists-user-${user || 'any'}-sort-${sort || 'updatedAt'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchWishlists(options: GetWishlistsOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildWishlistsWhere(options)
  const result = await payload.find({
    collection: 'wishlists',
    where,
    sort: options.sort || 'updatedAt',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as Wishlist[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedWishlists = (options?: GetWishlistsOptions) => {
  const fetchFn = () => fetchWishlists(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getWishlistsCacheKey(options)],
    { tags: ['wishlists'], revalidate: false }
  )()
}

async function fetchWishlistById(id: string): Promise<Wishlist | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'wishlists',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Wishlist | null
}

export const getCachedWishlistById = (id: string) => {
  const fetchFn = () => fetchWishlistById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`wishlist-${id}`],
    { tags: ['wishlists'], revalidate: false }
  )()
}

async function fetchWishlistByUser(userId: string): Promise<Wishlist | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'wishlists',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Wishlist | null
}

export const getCachedWishlistByUser = (userId: string) => {
  const fetchFn = () => fetchWishlistByUser(userId)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`wishlist-user-${userId}`],
    { tags: ['wishlists'], revalidate: false }
  )()
}