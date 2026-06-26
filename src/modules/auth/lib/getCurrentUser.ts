import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payloadconfig'

export async function getCurrentUser() {
  const payload = await getPayload({
    config,
  })

  try {
    const { user } = await payload.auth({
      headers: await headers(),
    })

    return user ?? null
  } catch {
    return null
  }
}