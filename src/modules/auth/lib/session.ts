import type { BasePayload } from 'payload'

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
