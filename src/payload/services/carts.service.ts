import { unstable_cache } from 'next/cache'
import { getPayloadInstance } from './getPayload'
import type { Cart } from '@/payload-types'
import { env } from '@/env'   // <-- добавили

async function fetchCartByUserId(userId: string): Promise<Cart | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'carts',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 2,
  })
  return (result.docs[0] || null) as unknown as Cart | null
}

export const getCachedCartByUserId = (userId: string) =>
  env.NODE_ENV === 'development'
    ? () => fetchCartByUserId(userId)
    : unstable_cache(
        () => fetchCartByUserId(userId),
        [`cart-user-${userId}`],
        { tags: ['carts'], revalidate: false }
      )

async function fetchCartById(id: string): Promise<Cart | null> {
  const payload = await getPayloadInstance()
  const result = await payload.find({
    collection: 'carts',
    where: { id: { equals: id } },
    limit: 1,
    depth: 2,
  })
  return (result.docs[0] || null) as unknown as Cart | null
}

export const getCachedCartById = (id: string) =>
  env.NODE_ENV === 'development'
    ? () => fetchCartById(id)
    : unstable_cache(
        () => fetchCartById(id),
        [`cart-${id}`],
        { tags: ['carts'], revalidate: false }
      )