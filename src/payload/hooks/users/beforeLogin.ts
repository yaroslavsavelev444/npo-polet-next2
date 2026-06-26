import type { CollectionBeforeLoginHook } from 'payload'

/**
 * Вызывается Payload перед проверкой пароля при login.
 * Блокирует вход если:
 * - аккаунт заблокирован навсегда (status: blocked)
 * - аккаунт временно заблокирован (lockUntil ещё не прошёл)
 * - аккаунт приостановлен (status: suspended)
 */
export const checkUserStatus: CollectionBeforeLoginHook = async ({ user }) => {
  // Временная блокировка после превышения попыток
  if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
    const minutesLeft = Math.ceil(
      (new Date(user.lockUntil).getTime() - Date.now()) / 60000,
    )
    throw new Error(
      `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`,
    )
  }

  // Перманентная блокировка администратором
  if (user.status === 'blocked') {
    throw new Error('Ваш аккаунт заблокирован. Обратитесь в поддержку.')
  }

  if (user.status === 'suspended') {
    throw new Error('Ваш аккаунт приостановлен. Обратитесь в поддержку.')
  }
}