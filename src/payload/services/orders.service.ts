// services/orders.service.ts
import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import { env } from '@/env'
import type { Order } from '@/payload-types'
import type { Where } from 'payload'

export interface GetOrdersOptions {
  user?: string
  status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  orderNumber?: string
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded'
  deliveryMethod?: 'door_to_door' | 'pickup_point' | 'transport_company'
  createdAt_gte?: string
  createdAt_lte?: string
  total_min?: number
  total_max?: number
  sort?: string
  limit?: number
  page?: number
  depth?: number
}

function buildOrdersWhere(options: GetOrdersOptions): Where {
  const where: Where = {}
  const conditions: any[] = []

  if (options.user) {
    conditions.push({ user: { equals: options.user } })
  }
  if (options.status) {
    conditions.push({ status: { equals: options.status } })
  }
  if (options.orderNumber) {
    conditions.push({ orderNumber: { equals: options.orderNumber } })
  }
  if (options.paymentStatus) {
    conditions.push({ 'payment.status': { equals: options.paymentStatus } })
  }
  if (options.deliveryMethod) {
    conditions.push({ 'delivery.method': { equals: options.deliveryMethod } })
  }
  if (options.createdAt_gte) {
    conditions.push({ createdAt: { greater_than_equal: options.createdAt_gte } })
  }
  if (options.createdAt_lte) {
    conditions.push({ createdAt: { less_than_equal: options.createdAt_lte } })
  }
  if (options.total_min !== undefined) {
    conditions.push({ 'pricing.total': { greater_than_equal: options.total_min } })
  }
  if (options.total_max !== undefined) {
    conditions.push({ 'pricing.total': { less_than_equal: options.total_max } })
  }

  if (conditions.length > 0) {
    where.and = conditions
  }
  return where
}

function getOrdersCacheKey(options?: GetOrdersOptions): string {
  const {
    user,
    status,
    orderNumber,
    paymentStatus,
    deliveryMethod,
    createdAt_gte,
    createdAt_lte,
    total_min,
    total_max,
    sort,
    limit,
    page,
    depth,
  } = options || {}
  return `orders-user-${user || 'any'}-st-${status || 'any'}-num-${orderNumber || 'any'}-pay-${paymentStatus || 'any'}-del-${deliveryMethod || 'any'}-cgte-${createdAt_gte || 'any'}-clte-${createdAt_lte || 'any'}-tmin-${total_min ?? 'any'}-tmax-${total_max ?? 'any'}-sort-${sort || 'createdAt'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
}

async function fetchOrders(options: GetOrdersOptions = {}) {
  const payload = await getPayloadInstance()
  const where = buildOrdersWhere(options)
  const result = await payload.find({
    collection: 'orders',
    where,
    sort: options.sort || 'createdAt',
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  })
  return {
    docs: result.docs as unknown as Order[],
    totalDocs: result.totalDocs,
  }
}

export const getCachedOrders = (options?: GetOrdersOptions) => {
  const fetchFn = () => fetchOrders(options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [getOrdersCacheKey(options)],
    { tags: ['orders'], revalidate: false }
  )()
}

async function fetchOrderById(id: string): Promise<Order | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'orders',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Order | null
}

export const getCachedOrderById = (id: string) => {
  const fetchFn = () => fetchOrderById(id)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`order-${id}`],
    { tags: ['orders'], revalidate: false }
  )()
}

async function fetchOrderByNumber(orderNumber: string): Promise<Order | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 1,
  })
  return (result.docs[0] || null) as unknown as Order | null
}

export const getCachedOrderByNumber = (orderNumber: string) => {
  const fetchFn = () => fetchOrderByNumber(orderNumber)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  return unstable_cache(
    fetchFn,
    [`order-num-${orderNumber}`],
    { tags: ['orders'], revalidate: false }
  )()
}

async function fetchOrdersByUser(userId: string, options: Omit<GetOrdersOptions, 'user'> = {}) {
  return fetchOrders({ ...options, user: userId })
}

export const getCachedOrdersByUser = (userId: string, options?: Omit<GetOrdersOptions, 'user'>) => {
  const fetchFn = () => fetchOrdersByUser(userId, options)
  if (env.NODE_ENV === 'development') {
    return fetchFn()
  }
  const cacheKey = `orders-user-${userId}-${getOrdersCacheKey({ ...options, user: userId })}`
  return unstable_cache(
    fetchFn,
    [cacheKey],
    { tags: ['orders'], revalidate: false }
  )()
}