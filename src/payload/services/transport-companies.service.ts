// services/transport-companies.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { TransportCompany } from '@/payload-types'
import type { Where } from 'payload'

export interface GetTransportCompaniesOptions {
  name?: string
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildTransportCompaniesWhere(options: GetTransportCompaniesOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.name) {
    conditions.push({ name: { contains: options.name } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getTransportCompaniesCacheKey(options?: GetTransportCompaniesOptions): string {
  const { name, sort, limit, page, depth } = options || {}
  return `transportcompanies-name-${name || 'any'}-sort-${sort || 'name'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchTransportCompanies(options: GetTransportCompaniesOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildTransportCompaniesWhere(options)
  const result = await payload.find({
    collection: 'transport-companies',
    where,
    sort: options.sort || 'name',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as TransportCompany[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedTransportCompanies = (options?: GetTransportCompaniesOptions) => {
  const fetchFn = () => fetchTransportCompanies(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getTransportCompaniesCacheKey(options)],
    { tags: ['transport-companies'], revalidate: false }
  )()
}

async function fetchTransportCompanyById(id: string): Promise<TransportCompany | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'transport-companies',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as TransportCompany | null
}

export const getCachedTransportCompanyById = (id: string) => {
  const fetchFn = () => fetchTransportCompanyById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`transport-company-${id}`],
    { tags: ['transport-companies'], revalidate: false }
  )()
}