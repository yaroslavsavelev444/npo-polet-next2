import type { BasePayload } from 'payload'
import { isUser } from './typeGuards'

// ─── Константы ────────────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 дней — совпадает с JWT tokenExpiration
export const SESSION_ACTIVITY_UPDATE_MS = 5 * 60 * 1000 // Обновляем lastActiveAt каждые 5 мин

// ─── Определение устройства ───────────────────────────────────────────────────

export function parseDeviceLabel(userAgent: string): string {
  if (!userAgent) return 'Неизвестное устройство'

  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) {
    return /Mobile/.test(userAgent) ? 'Android телефон' : 'Android планшет'
  }
  if (/Macintosh/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows'
  if (/Linux/.test(userAgent)) return 'Linux'

  return 'Браузер'
}

// ─── CRUD сессий ─────────────────────────────────────────────────────────────

export async function createSession(
  payload: BasePayload,
  {
    userId,
    ip,
    userAgent,
  }: { userId: string; ip: string; userAgent: string },
) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  const session = await payload.create({
    collection: 'sessions',
    data: {
      user: Number(userId),
      ip,
      userAgent,
      deviceLabel: parseDeviceLabel(userAgent),
      createdAt: now.toISOString(),
      lastActiveAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revoked: false,
    },
    // Bypass access control — вызывается только с сервера
    overrideAccess: true,
  })

  return session
}

export async function getActiveSession(payload: BasePayload, sessionId: string) {
  try {
    const session = await payload.findByID({
      collection: 'sessions',
      id: sessionId,
      overrideAccess: true,
    })

    if (!session) return null
    if (session.revoked) return null
    if (new Date(session.expiresAt) < new Date()) return null

    return session
  } catch {
    return null
  }
}

export interface SessionStatus {
  userId: string
  email: string
  twoFAVerified: boolean
}

/**
 * Единая проверка "авторизован ли запрос и пройдена ли 2FA" — используется и
 * в /api/auth/session-status (для клиентских проверок вроде FeedbackButton),
 * и напрямую в proxy.ts. Раньше proxy.ts не мог вызвать Payload Local API
 * (считалось, что Proxy работает в Edge Runtime) и поэтому делал HTTP-запрос
 * к самому себе через публичный домен — начиная с Next.js 15.5 Proxy по
 * умолчанию выполняется в Node.js runtime (см. node_modules/next/dist/docs/
 * .../file-conventions/proxy.md, раздел "Runtime"), и это ограничение больше
 * не действует. Самозапрос через nginx был единственным источником сбоя:
 * при неудаче (в т.ч. transient) вызывающий код удалял payload-token —
 * отсюда терялась только что установленная сессия сразу после логина.
 */
export async function resolveSessionStatus(
  payload: BasePayload,
  headers: Headers,
  sessionId?: string | null,
): Promise<SessionStatus | null> {
  let user: Awaited<ReturnType<typeof payload.auth>>['user']
  try {
    const auth = await payload.auth({ headers })
    user = auth.user
  } catch {
    return null
  }

  if (!user || !isUser(user)) return null

  if (sessionId) {
    const session = await getActiveSession(payload, sessionId)
    if (!session) return null
  }

  if (user.status === 'blocked' || user.status === 'suspended') return null

  const TWO_FA_TTL_MS = 24 * 60 * 60 * 1000
  const verifiedAt = user.twoFAVerifiedAt
    ? new Date(user.twoFAVerifiedAt).getTime()
    : 0
  const twoFAVerified =
    user.twoFAVerified === true && Date.now() - verifiedAt < TWO_FA_TTL_MS

  return { userId: String(user.id), email: user.email, twoFAVerified }
}

export async function updateSessionActivity(payload: BasePayload, sessionId: string) {
  await payload.update({
    collection: 'sessions',
    id: sessionId,
    data: { lastActiveAt: new Date().toISOString() },
    overrideAccess: true,
  })
}

export async function revokeSession(
  payload: BasePayload,
  sessionId: string,
  reason: 'logout' | 'logout_all' | 'password_changed' | 'admin' = 'logout',
) {
  await payload.update({
    collection: 'sessions',
    id: sessionId,
    data: { revoked: true, revokedReason: reason },
    overrideAccess: true,
  })
}

export async function revokeAllUserSessions(
  payload: BasePayload,
  userId: string,
  reason: 'logout_all' | 'password_changed' = 'logout_all',
) {
  const { docs } = await payload.find({
    collection: 'sessions',
    where: {
      and: [
        { user: { equals: userId } },
        { revoked: { equals: false } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    limit: 100,
    overrideAccess: true,
  })

  await Promise.all(
    docs.map((s) =>
      payload.update({
        collection: 'sessions',
        id: s.id,
        data: { revoked: true, revokedReason: reason },
        overrideAccess: true,
      }),
    ),
  )
}

export async function getUserActiveSessions(payload: BasePayload, userId: string) {
  const { docs } = await payload.find({
    collection: 'sessions',
    where: {
      and: [
        { user: { equals: userId } },
        { revoked: { equals: false } },
        { expiresAt: { greater_than: new Date().toISOString() } },
      ],
    },
    sort: '-lastActiveAt',
    limit: 20,
    overrideAccess: true,
  })

  return docs
}

/**
 * Инвалидирует (отзывает) одну сессию.
 * Если передан userId, проверяет, что сессия принадлежит этому пользователю.
 *
 * @param payload - экземпляр Payload
 * @param sessionId - ID сессии (строка или число)
 * @param userId - ID пользователя (опционально, для проверки владельца)
 * @param reason - причина отзыва (по умолчанию 'logout')
 * @returns true, если сессия была найдена и отозвана, иначе false
 */
export async function invalidateSession(
  payload: BasePayload,
  sessionId: string,
  userId?: string,
  reason: 'logout' | 'logout_all' | 'password_changed' | 'admin' = 'logout',
): Promise<boolean> {
  try {
    // Если указан userId, проверяем, что сессия принадлежит этому пользователю
    if (userId) {
      const session = await payload.findByID({
        collection: 'sessions',
        id: sessionId,
        // depth: 0 — иначе relationship "user" возвращается как populated-объект,
        // и сравнение String(session.user) с userId ниже всегда ложно
        depth: 0,
        overrideAccess: true,
      });
      if (!session) return false;
      // Проверяем, что сессия принадлежит пользователю (преобразуем к строке для надёжности)
      if (String(session.user) !== String(userId)) {
        throw new Error('Session does not belong to the given user');
      }
    }

    // Отзываем сессию
    await payload.update({
      collection: 'sessions',
      id: sessionId,
      data: {
        revoked: true,
        revokedReason: reason,
      },
      overrideAccess: true,
    });

    return true;
  } catch {
    // Если сессия не найдена или произошла ошибка, возвращаем false
    return false;
  }
}
