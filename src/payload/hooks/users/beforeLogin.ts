import type { CollectionBeforeLoginHook } from 'payload'
import {
  AccountBlockedError,
  AccountSuspendedError,
} from '@/modules/auth/lib/accountStatusErrors'

/**
 * Вызывается Payload перед выдачей токена — но ПОСЛЕ проверки пароля и
 * встроенной проверки Payload на lockUntil (см. checkLoginPermission в
 * node_modules/payload/dist/auth/operations/login.js: она вызывается сразу
 * после чтения пользователя и до сверки пароля, поэтому временную
 * блокировку по числу попыток Payload обрабатывает сам через
 * auth.maxLoginAttempts/auth.lockTime — см. Users.auth в
 * src/payload/collections/User.ts — и до этого хука такой пользователь
 * вообще не доходит). Здесь остаётся только наша бизнес-логика поверх
 * статуса аккаунта, которую Payload не знает:
 * - аккаунт заблокирован администратором (status: blocked)
 * - аккаунт приостановлен (status: suspended)
 */
export const checkUserStatus: CollectionBeforeLoginHook = async ({ user }) => {
  if (user.status === 'blocked') {
    throw new AccountBlockedError()
  }

  if (user.status === 'suspended') {
    throw new AccountSuspendedError()
  }
}
