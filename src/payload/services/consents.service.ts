// services/consents.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { Consent } from '@/payload-types'
import type { Where } from 'payload'

export interface GetConsentsOptions {
  isActive?: boolean
  isRequired?: boolean
  slug?: string
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildConsentsWhere(options: GetConsentsOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.isActive !== undefined) {
    conditions.push({ isActive: { equals: options.isActive } })
  }
  if (options.isRequired !== undefined) {
    conditions.push({ isRequired: { equals: options.isRequired } })
  }
  if (options.slug) {
    conditions.push({ slug: { equals: options.slug } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getConsentsCacheKey(options?: GetConsentsOptions): string {
  const { isActive, isRequired, slug, sort, limit, page, depth } = options || {}
  return `consents-active-${isActive ?? 'any'}-req-${isRequired ?? 'any'}-slug-${slug || 'any'}-sort-${sort || 'version'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchConsents(options: GetConsentsOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildConsentsWhere(options)
  const result = await payload.find({
    collection: 'consents',
    where,
    sort: options.sort || 'version',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as Consent[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedConsents = (options?: GetConsentsOptions) => {
  const fetchFn = () => fetchConsents(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getConsentsCacheKey(options)],
    { tags: ['consents'], revalidate: false }
  )()
}

async function fetchConsentBySlug(slug: string): Promise<Consent | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'consents',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Consent | null
}

export const getCachedConsentBySlug = (slug: string) => {
  const fetchFn = () => fetchConsentBySlug(slug)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`consent-${slug}`],
    { tags: ['consents'], revalidate: false }
  )()
}

async function fetchConsentById(id: string): Promise<Consent | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'consents',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Consent | null
}

export const getCachedConsentById = (id: string) => {
  const fetchFn = () => fetchConsentById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`consent-${id}`],
    { tags: ['consents'], revalidate: false }
  )()
}