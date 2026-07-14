"use server";

import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyPasswordChanged } from "@/services/notifications/notifyPasswordChanged";
import { notifyPasswordReset } from "@/services/notifications/notifyPasswordReset";
import { RATE_LIMITS } from "../lib/rateLimit";
import { revokeAllUserSessions } from "../lib/session";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/passwordReset.schema";

/**
 * Server Action: запрос сброса пароля.
 *
 * payload.forgotPassword({ disableEmail: true }) — генерирует reset-токен
 * и сохраняет его (хешированный) в БД, но НЕ шлёт письмо сам: у Payload
 * есть собственный, полностью независимый email-адаптер (payload.config.ts
 * → email:), который в этом проекте не настроен, поэтому без disableEmail
 * Payload молча писал в консоль ("Email attempted without being
 * configured") вместо реальной отправки — письма никогда не уходили.
 * Письмо отправляем сами через notifyPasswordReset — тот же централизованный
 * EmailService/Nodemailer, что и все остальные письма в проекте.
 *
 * Всегда возвращаем success — защита от email enumeration.
 */
export async function forgotPasswordAction(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return actionError(
      "Введите корректный email",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { email } = parsed.data;
  const { ip } = await getRequestMeta();

  // Rate limit
  const rl = await RATE_LIMITS.forgotPassword(ip);
  if (!rl.allowed) {
    return actionError("Слишком много запросов. Попробуйте позже.");
  }

  const payload = await getPayloadInstance();

  // Возвращает token, если email найден, иначе null — оба случая не
  // раскрываем клиенту (см. actionSuccess ниже, единый для обоих веток).
  const token = await payload.forgotPassword({
    collection: "users",
    data: { email },
    disableEmail: true,
  });

  if (token) {
    await notifyPasswordReset({ email, token });
  }

  // Всегда возвращаем success
  return actionSuccess({
    message: "Если аккаунт существует, письмо со ссылкой будет отправлено.",
  });
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
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionError(
      "Проверьте введённые данные",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { token, password } = parsed.data;
  const payload = await getPayloadInstance();

  try {
    // Payload сам проверяет токен, его срок жизни и обновляет пароль
    const result = await payload.resetPassword({
      collection: "users",
      data: { token, password },
      overrideAccess: true,
    });

    // Payload возвращает { token, user } — используем user.id
    const userId = String(result.user.id);

    // Отзываем все сессии (пароль сменился — старые сессии не должны работать)
    await revokeAllUserSessions(payload, userId, "password_changed");
    await notifyPasswordChanged({
      email: result.user.email as string,
      userName: result.user.name as string,
    });
    void notify(payload, userId, "password_changed", {});
    // Сбрасываем 2FA флаг — при следующем входе потребуется заново
    await payload.update({
      collection: "users",
      id: userId,
      data: {
        twoFAVerified: false,
        twoFAVerifiedAt: null,
      },
      overrideAccess: true,
    });

    return actionSuccess({
      message: "Пароль успешно изменён. Войдите с новым паролем.",
    });
  } catch (err: unknown) {
    // Payload бросает если токен невалиден/истёк
    const message =
      err instanceof Error ? err.message : "Ссылка недействительна";

    if (
      message.toLowerCase().includes("token") ||
      message.toLowerCase().includes("expired")
    ) {
      return actionError(
        "Ссылка для сброса пароля недействительна или истекла.",
      );
    }

    throw err;
  }
}
