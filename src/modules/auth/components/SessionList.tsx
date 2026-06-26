'use client'

import { useActionState } from 'react'
import { revokeSessionAction } from '../actions/logout'
import { logoutAllAction } from '../actions/logout'

interface SessionItem {
  id: string
  deviceLabel: string
  ip: string
  createdAt: string
  lastActiveAt: string
  isCurrent: boolean
}

interface SessionListProps {
  sessions: SessionItem[]
}

/**
 * Список активных сессий пользователя.
 * Каждая сессия — отдельная форма для отзыва.
 * Кнопка "Выйти со всех устройств" — форма с logoutAllAction.
 */
export function SessionList({ sessions }: SessionListProps) {
  const [revokeState, revokeAction, isRevoking] = useActionState(
    revokeSessionAction,
    null,
  )

  if (sessions.length === 0) {
    return <p className="text-sm text-gray-400">Нет активных сессий</p>
  }

  return (
    <div className="space-y-4">
      {revokeState && !revokeState.success && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {revokeState.error}
        </div>
      )}

      <ul className="space-y-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-center justify-between gap-4 py-3
                       border-b border-gray-100 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {session.deviceLabel}
                </span>
                {session.isCurrent && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs
                                   font-medium text-green-700">
                    Текущая
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {session.ip} · Последняя активность:{' '}
                {new Date(session.lastActiveAt).toLocaleString('ru-RU')}
              </p>
            </div>

            {!session.isCurrent && (
              <form action={revokeAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <button
                  type="submit"
                  disabled={isRevoking}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs
                             text-gray-600 hover:bg-gray-50 hover:border-gray-300
                             disabled:opacity-50 transition-colors shrink-0"
                >
                  Завершить
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {/* Выйти со всех устройств */}
      {sessions.length > 1 && (
        <form action={logoutAllAction}>
          <button
            type="submit"
            className="text-sm text-red-600 hover:text-red-500 font-medium"
          >
            Выйти со всех устройств
          </button>
        </form>
      )}
    </div>
  )
}