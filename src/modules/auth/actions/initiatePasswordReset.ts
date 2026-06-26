'use server'

import { RATE_LIMITS } from '../lib/rateLimit'
import { forgotPasswordSchema, resetPasswordSchema } from '../schemas/passwordReset.schema'
import { revokeAllUserSessions } from '../lib/session'
import { getPayloadInstance } from '@/payload/services/getPayload'
import { actionError, actionSuccess, getRequestMeta } from '../lib/utils'

/**
 * Server Action: запрос сброса пароля.
 *
 * Используем ЧИСТЫЙ Payload flow:
 * payload.forgotPassword() → Payload сам:
 *   - генерирует reset-токен
 *   - сохраняет его (хешированный) в БД
 *   - отправляет email со ссылкой /auth/reset-password?token=xxx
 *
 * Всегда возвращаем success — защита от email enumeration.
 */
export async function forgotPasswordAction(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return actionError('Введите корректный email', parsed.error.flatten().fieldErrors)
  }

  const { email } = parsed.data
  const { ip } = await getRequestMeta()

  // Rate limit
  const rl = await RATE_LIMITS.forgotPassword(ip)
  if (!rl.allowed) {
    return actionError('Слишком много запросов. Попробуйте позже.')
  }

  const payload = await getPayloadInstance()

  // Payload forgotPassword:
  // - если email найден → генерирует токен + отправляет письмо
  // - если не найден → ничего не делает (тихо)
  // Оба случая не раскрываем клиенту
  await payload.forgotPassword({
    collection: 'users',
    data: { email },
    // disableEmail: false — Payload сам отправляет письмо
  })

  // Всегда возвращаем success
  return actionSuccess({
    message: 'Если аккаунт существует, письмо со ссылкой будет отправлено.',
  })
}

/**
 * Server Action: установка нового пароля.
 *
 * Чистый Payload flow:
 * payload.resetPassword() → Payload:
 *   - находит пользователя по токену
 *   - проверяет что токен не истёк
 *   - обновляет пароль (bcrypt)
 *   - инвалидирует токен
 *   - возвращает JWT новой сессии
 *
 * Мы дополнительно:
 *   - отзываем все активные сессии (смена пароля = выход со всех устройств)
 *   - сбрасываем twoFAVerified
 */
export async function resetPasswordAction(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return actionError('Проверьте введённые данные', parsed.error.flatten().fieldErrors)
  }

  const { token, password } = parsed.data
  const payload = await getPayloadInstance()

  try {
    // Payload сам проверяет токен, его срок жизни и обновляет пароль
    const result = await payload.resetPassword({
      collection: 'users',
      data: { token, password },
      overrideAccess: true,
    })

    // Payload возвращает { token, user } — используем user.id
    const userId = String(result.user.id)

    // Отзываем все сессии (пароль сменился — старые сессии не должны работать)
    await revokeAllUserSessions(payload, userId, 'password_changed')

    // Сбрасываем 2FA флаг — при следующем входе потребуется заново
    await payload.update({
      collection: 'users',
      id: userId,
      data: {
        twoFAVerified: false,
        twoFAVerifiedAt: null,
      },
      overrideAccess: true,
    })

    return actionSuccess({
      message: 'Пароль успешно изменён. Войдите с новым паролем.',
    })
  } catch (err: unknown) {
    // Payload бросает если токен невалиден/истёк
    const message = err instanceof Error ? err.message : 'Ссылка недействительна'

    if (
      message.toLowerCase().includes('token') ||
      message.toLowerCase().includes('expired')
    ) {
      return actionError('Ссылка для сброса пароля недействительна или истекла.')
    }

    throw err
  }
}