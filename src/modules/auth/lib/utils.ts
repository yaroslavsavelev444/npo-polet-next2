import { headers } from 'next/headers'
import { AuthErrorCode, AuthFormValues } from '../types'


/**
 * Извлекает IP и User-Agent из входящего запроса.
 *
 * IP берём из X-Real-IP, который наш reverse-proxy (nginx) выставляет как
 * $remote_addr — это реальный адрес TCP-соединения, клиент подделать его не
 * может. НЕЛЬЗЯ доверять первому элементу X-Forwarded-For: nginx дописывает
 * клиентское значение слева ($proxy_add_x_forwarded_for), поэтому XFF[0]
 * полностью контролируется отправителем. Раньше IP брался именно оттуда — и
 * любой rate-limit (login/register/forgot-password/feedback/review), а также
 * IP в аудите сессий/заказов/OTP, обходились простой ротацией заголовка
 * X-Forwarded-For.
 *
 * Fallback на последний (самый правый, добавленный доверенным прокси) элемент
 * XFF — на случай окружения без X-Real-IP; XFF[0] не используем никогда.
 */
export async function getRequestMeta() {
  const headersList = await headers()
  const xff = headersList.get('x-forwarded-for')
  const ip =
    headersList.get('x-real-ip')?.trim() ||
    xff?.split(',').pop()?.trim() ||
    'unknown'
  const userAgent = headersList.get('user-agent') ?? ''
  return { ip, userAgent }
}

/**
 * Единый формат ошибки для Server Actions. `code` — необязательная
 * категория (см. AuthErrorCode) для UI, которая позволяет форме показывать
 * разное оформление (например предупреждение для временной блокировки
 * вместо обычной ошибки для неверного пароля), не парся текст сообщения.
 *
 * `values` — безопасные значения полей, которые форма подставит обратно в
 * `defaultValue`, чтобы пользователь не перезаполнял их после ошибки
 * (см. AuthFormValues). Пароли туда не кладём никогда.
 */
export function actionError(
  message: string,
  fieldErrors?: Record<string, string[]>,
  code?: AuthErrorCode,
  values?: AuthFormValues,
) {
  return { success: false as const, error: message, fieldErrors, code, values }
}

/**
 * Достаёт безопасные значения из сырой FormData — так их можно вернуть форме
 * даже тогда, когда валидация не прошла и типизированных данных ещё нет.
 */
export function formValues(
  formData: FormData,
  fields: ReadonlyArray<keyof AuthFormValues>,
): AuthFormValues {
  const values: AuthFormValues = {}
  for (const field of fields) {
    const raw = formData.get(field)
    if (typeof raw === 'string') values[field] = raw
  }
  return values
}

export function actionSuccess<T>(data: T) {
  return { success: true as const, data }
}