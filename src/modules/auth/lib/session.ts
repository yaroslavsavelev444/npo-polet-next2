import type { BasePayload } from 'payload'
import {
  getSidForSessionRow,
  revokeAllPayloadSessions,
  revokePayloadSession,
} from './payloadSessions'
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
    payloadSessionId,
  }: {
    userId: string
    ip: string
    userAgent: string
    /**
     * claim `sid` выданного пользователю JWT. Без него отзыв этой записи не
     * сможет инвалидировать сам токен (см. payloadSessions.ts).
     */
    payloadSessionId?: string | null
  },
) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  const session = await payload.create({
    collection: 'sessions',
    data: {
      user: Number(userId),
      ip,
      userAgent,
      payloadSessionId: payloadSessionId ?? null,
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
      // depth: 0 — иначе relationship `user` приходит populated-объектом, и
      // сравнение владельца у вызывающего кода всегда ложно (та же ловушка,
      // что описана в invalidateSession ниже).
      depth: 0,
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
}

/**
 * Единая проверка "авторизован ли запрос" — используется и в
 * /api/auth/session-status (для клиентских проверок вроде FeedbackButton),
 * и напрямую в proxy.ts.
 *
 * Отдельного признака 2FA здесь нет намеренно: payload-token выдаётся только
 * после успешного подтверждения OTP (см. verifyOtp.ts), поэтому валидный
 * токен — это уже и есть "второй фактор пройден". Раньше здесь считался
 * twoFAVerified по одноимённому полю пользователя с окном в 24 часа, и оно
 * оставалось true между входами — то есть при повторном входе гейт пропускал
 * пользователя ещё до ввода кода.
 *
 * Раньше proxy.ts не мог вызвать Payload Local API
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

  // Отсутствие session-id раньше означало «проверять нечего» — то есть гейт
  // проходился простым удалением этой cookie, а отозванная сессия продолжала
  // работать. Теперь отсутствие или невалидность записи — это отказ:
  // session-id выставляется в verifyOtpAction вместе с самим токеном, поэтому
  // у завершённого входа она есть всегда, а «токен без сессии» легитимным
  // состоянием не является.
  const session = sessionId ? await getActiveSession(payload, sessionId) : null
  if (!session) return null
  if (String(session.user) !== String(user.id)) return null

  if (user.status === 'blocked' || user.status === 'suspended') return null

  return { userId: String(user.id), email: user.email }
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
  // Сначала снимаем сам токен с валидности (users_sessions), и только потом
  // помечаем запись отозванной: если второе упадёт, доступ уже закрыт.
  // Обратный порядок оставлял бы работающий JWT при «отозванной» на витрине
  // сессии — то есть ровно ту дыру, ради которой это и делается.
  const session = await payload.findByID({
    collection: 'sessions',
    id: sessionId,
    depth: 0,
    overrideAccess: true,
  })

  const sid = await getSidForSessionRow(payload, sessionId)
  if (sid && session?.user) {
    await revokePayloadSession(payload, Number(session.user), sid)
  }

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
  // Позволяет оставить активной одну сессию (напр. текущую при смене пароля
  // из профиля) — все остальные устройства выкидываются.
  exceptSessionId?: string,
) {
  // Токены снимаем СРАЗУ и ЦЕЛИКОМ по пользователю, а не по списку наших
  // записей: у токена может не быть парной записи в `sessions` (создание
  // записи в verifyOtpAction не критично и её сбой не отменяет вход), а
  // «выйти со всех устройств» / смена пароля обязаны закрыть доступ полностью,
  // а не только там, где витрина знает об устройстве.
  const exceptSid = exceptSessionId
    ? await getSidForSessionRow(payload, exceptSessionId)
    : null
  await revokeAllPayloadSessions(payload, userId, exceptSid)

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
    docs
      .filter((s) => !exceptSessionId || String(s.id) !== String(exceptSessionId))
      .map((s) =>
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

    // Отзываем сессию (revokeSession снимает и сам payload-token —
    // см. payloadSessions.ts)
    await revokeSession(payload, sessionId, reason);

    return true;
  } catch {
    // Если сессия не найдена или произошла ошибка, возвращаем false
    return false;
  }
}
