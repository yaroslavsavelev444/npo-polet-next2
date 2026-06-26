import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@/payloadconfig'
import { logoutAction } from '@/modules/auth/actions/logout'
import { getUserActiveSessions } from '@/modules/auth/lib/session'
import {SessionList}  from '@/modules/auth/components/SessionList'

/**
 * Страница профиля.
 * Server Component: загружает данные пользователя + сессии через Payload Local API.
 * Нет клиентских запросов, нет useState для данных.
 */
export default async function ProfilePage() {
  const cookieStore = await cookies()
  const payloadToken = cookieStore.get('payload-token')
  if (!payloadToken) redirect('/auth/login')

  const payload = await getPayload({ config })
  const h = await headers()
  const { user } = await payload.auth({ headers: h })

  if (!user) redirect('/auth/login')

  // Принятые согласия
  const { docs: userConsents } = await payload.find({
    collection: 'user-consents',
    where: { user: { equals: user.id } },
    sort: '-acceptedAt',
    overrideAccess: true,
  })

  // Активные сессии
  const sessions = await getUserActiveSessions(payload, String(user.id))

  const currentSessionId = cookieStore.get('session-id')?.value

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm
                       text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Выйти
          </button>
        </form>
      </div>

      {/* Информация */}
      <section className="rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Аккаунт</h2>
        <dl className="space-y-3">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Роль</dt>
            <dd className="font-medium text-gray-900 capitalize">{user.role}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Статус</dt>
            <dd className="font-medium text-gray-900">{user.status}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Email подтверждён</dt>
            <dd className="font-medium text-gray-900">
              {user.emailVerified ? '✅ Да' : '❌ Нет'}
            </dd>
          </div>
          {user.lastLoginAt && (
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Последний вход</dt>
              <dd className="font-medium text-gray-900">
                {new Date(user.lastLoginAt).toLocaleString('ru-RU')}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Принятые согласия */}
      {userConsents.length > 0 && (
        <section className="rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Принятые соглашения</h2>
          <ul className="space-y-2">
            {userConsents.map((uc) => (
              <li key={String(uc.id)} className="flex justify-between text-sm">
                <span className="text-gray-700">{uc.consentSlug as string}</span>
                <span className="text-gray-400">
                  v{uc.version as string} ·{' '}
                  {new Date(uc.acceptedAt as string).toLocaleDateString('ru-RU')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Активные сессии */}
      <section className="rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Активные устройства
        </h2>
        <SessionList
          sessions={sessions.map((s) => ({
            id: String(s.id),
            deviceLabel: (s.deviceLabel ?? 'Устройство') as string,
            ip: s.ip as string,
            createdAt: s.createdAt as string,
            lastActiveAt: s.lastActiveAt as string,
            isCurrent: String(s.id) === currentSessionId,
          }))}
        />
      </section>
    </div>
  )
}