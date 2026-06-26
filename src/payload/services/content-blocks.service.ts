// services/content-blocks.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { ContentBlock } from '@/payload-types'
import type { Where } from 'payload'

export interface GetContentBlocksOptions {
  isActive?: boolean
  variant?: string
  tags?: string[]
  position_gte?: number
  position_lte?: number
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildContentBlocksWhere(options: GetContentBlocksOptions): Where {
  const conditions: any[] = []

  if (options.isActive !== undefined) {
    conditions.push({ isActive: { equals: options.isActive } })
  }

  if (options.variant) {
    conditions.push({ variant: { equals: options.variant } })
  }

  if (options.tags && options.tags.length > 0) {
    // Лучший способ для array field в Payload
    conditions.push({
      tags: {
        in: options.tags.map(t => t.toLowerCase().trim()),
      },
    })
  }

  if (options.position_gte !== undefined) {
    conditions.push({ position: { greater_than_equal: options.position_gte } })
  }

  if (options.position_lte !== undefined) {
    conditions.push({ position: { less_than_equal: options.position_lte } })
  }

  return conditions.length > 0 ? { and: conditions } : {}
}

function getContentBlocksCacheKey(options: GetContentBlocksOptions = {}): string {
  const {
    isActive,
    variant,
    tags,
    position_gte,
    position_lte,
    sort,
    limit,
    page,
    depth,
  } = options

  const tagsKey = tags?.sort().join('-') || 'any'
  const variantKey = variant || 'any'

  return `contentblocks-${isActive ?? 'any'}-var-${variantKey}-tags-${tagsKey}-pgte-${position_gte ?? 'any'}-plte-${position_lte ?? 'any'}-sort-${sort || 'position'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchContentBlocks(options: GetContentBlocksOptions = {}) {
  const payload = await getPayloadInstance()

  const where = buildContentBlocksWhere(options)

  const result = await payload.find({
    collection: 'content-blocks',
    where,
    sort: options.sort || 'position',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 2, // 2 — чтобы подтягивать image
  })

  return {
    docs: result.docs as ContentBlock[],
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
  }
}

export const getCachedContentBlocks = (options: GetContentBlocksOptions = {}) => {
  const fetchFn = () => fetchContentBlocks(options)

  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }

  return unstable_cache(
    fetchFn,
    [getContentBlocksCacheKey(options)],
    {
      tags: ['content-blocks'],
      revalidate: false, // или 3600 если хочешь таймаут
    }
  )()
}

// ==================== По ID ====================

async function fetchContentBlockById(id: string): Promise<ContentBlock | null> {
  const payload = await getPayloadInstance()

  const result = await payload.find({
    collection: 'content-blocks',
    where: { id: { equals: id } },
    limit: 1,
    depth: 2,
  })

  return (result.docs[0] || null) as ContentBlock | null
}

export const getCachedContentBlockById = (id: string) => {
  const fetchFn = () => fetchContentBlockById(id)

  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }

  return unstable_cache(
    fetchFn,
    [`content-block-${id}`],
    { tags: ['content-blocks'], revalidate: false }
  )()
}

// ==================== Удобные методы ====================

export const getActiveContentBlocks = (options: Omit<GetContentBlocksOptions, 'isActive'> = {}) =>
  getCachedContentBlocks({ ...options, isActive: true })

export const getContentBlocksByVariant = (variant: string, limit = 10) =>
  getCachedContentBlocks({ isActive: true, variant, limit })

export const getContentBlocksByTags = (tags: string[], limit = 20) =>
  getCachedContentBlocks({ isActive: true, tags, limit })