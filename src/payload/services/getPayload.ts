// src/services/payload/getPayload.ts
import { getPayload } from 'payload'
import config from '@/payloadconfig'

let cachedPayload: Awaited<ReturnType<typeof getPayload>> | null = null

/**
 * Возвращает экземпляр Payload (синглтон внутри процесса).
 * Payload сам кэширует, но мы сохраняем для удобства.
 */
export async function getPayloadInstance() {
  if (!cachedPayload) {
    cachedPayload = await getPayload({ config })
  }
  return cachedPayload
}