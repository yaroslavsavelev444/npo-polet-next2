// services/content-blocks.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { ContentBlock } from '@/payload-types'
import type { Where } from 'payload'

export interface GetContentBlocksOptions {
  isActive?: boolean
  tags?: string[]
  position_gte?: number
  position_lte?: number
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildContentBlocksWhere(options: GetContentBlocksOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.isActive !== undefined) {
    conditions.push({ isActive: { equals: options.isActive } })
  }
  if (options.tags && options.tags.length > 0) {
    conditions.push({
      tags: { contains: options.tags[0] } // payload supports contains for arrays
    })
  }
  if (options.position_gte !== undefined) {
    conditions.push({ position: { greater_than_equal: options.position_gte } })
  }
  if (options.position_lte !== undefined) {
    conditions.push({ position: { less_than_equal: options.position_lte } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getContentBlocksCacheKey(options?: GetContentBlocksOptions): string {
  const { isActive, tags, position_gte, position_lte, sort, limit, page, depth } = options || {}
  const tagsKey = tags ? tags.join('-') : 'any'
  return `contentblocks-active-${isActive ?? 'any'}-tags-${tagsKey}-pgte-${position_gte ?? 'any'}-plte-${position_lte ?? 'any'}-sort-${sort || 'position'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
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
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as ContentBlock[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedContentBlocks = (options?: GetContentBlocksOptions) => {
  const fetchFn = () => fetchContentBlocks(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getContentBlocksCacheKey(options)],
    { tags: ['content-blocks'], revalidate: false }
  )()
}

async function fetchContentBlockById(id: string): Promise<ContentBlock | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'content-blocks',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as ContentBlock | null
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