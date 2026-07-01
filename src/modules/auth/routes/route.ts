import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payloadconfig'
import { getActiveSession } from '@/modules/auth/lib/session'
import { isTwoFAVerified } from '../lib/twoFA'

/**
 * GET /api/auth/session-status
 *
 * Вызывается middleware на каждом защищённом запросе.
 * Работает в Node.js runtime (не Edge) — может использовать Payload Local API.
 *
 * Проверяет:
 * 1. JWT токен (через payload.auth())
 * 2. Сессия существует, не отозвана, не истекла
 * 3. Пользователь прошёл 2FA (twoFAVerified: true)
 *
 * Возвращает:
 * - 200 { twoFAVerified: boolean }
 * - 401 если что-то не так
 */
export async function GET(req: NextRequest) {
  const payload = await getPayload({ config })

  // Проверяем JWT через Payload
  let user: Awaited<ReturnType<typeof payload.auth>>['user']

  try {
    const auth = await payload.auth({ headers: req.headers })
    user = auth.user
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Проверяем сессию
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (sessionId) {
    const session = await getActiveSession(payload, sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session revoked or expired' }, { status: 401 })
    }
  }

  // Проверяем статус пользователя
  if (user.status === 'blocked' || user.status === 'suspended') {
    return NextResponse.json({ error: 'Account blocked' }, { status: 403 })
  }
  
  const twoFAVerified = isTwoFAVerified(user)


  return NextResponse.json({ twoFAVerified })
}

// Этот route работает в Node.js runtime — может использовать Payload Local API
export const runtime = 'nodejs'