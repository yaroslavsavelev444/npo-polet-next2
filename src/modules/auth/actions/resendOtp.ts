"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import { safeCreateOtp } from "../lib/errorHandling";
import { RATE_LIMITS } from "../lib/rateLimit";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import type { OtpType } from "../types";

const resendSchema = z.object({
  type: z.enum(["login_2fa", "email_verify"]),
});

/**
 * Server Action: повторная отправка OTP.
 *
 * Пользователь в обоих сценариях уже залогинен (JWT cookie установлен):
 * - При регистрации: registerAction поставил cookie
 * - При логине: loginAction поставил cookie
 */
export async function resendOtpAction(_prevState: unknown, formData: FormData) {
  const parsed = resendSchema.safeParse({ type: formData.get("type") });
  if (!parsed.success) {
    return actionError("Некорректный тип кода");
  }

  const { type } = parsed.data;
  const cookieStore = await cookies();
  const payloadToken = cookieStore.get("payload-token");

  if (!payloadToken) {
    return actionError("Сессия не найдена. Войдите снова.");
  }

  const payload = await getPayloadInstance();

  // Идентифицируем пользователя через JWT
  let userEmail: string;
  let userId: string;
  try {
    // См. verifyOtp.ts: нужны реальные заголовки запроса (Origin/Sec-Fetch-Site),
    // иначе Payload's cookie-CSRF проверка молча отклоняет валидный токен.
    const { user } = await payload.auth({ headers: await headers() });
    if (!user) {
      return actionError("Сессия истекла. Войдите снова.");
    }
    userEmail = user.email;
    userId = String(user.id);
  } catch {
    return actionError("Не удалось проверить сессию.");
  }

  const { ip } = await getRequestMeta();

  // Rate limit по email
  const rl = await RATE_LIMITS.otpResend(userEmail);
  if (!rl.allowed) {
    return actionError("Слишком много запросов. Подождите несколько минут.");
  }

  const otp = await safeCreateOtp(
    payload,
    { userId, type: type as OtpType, ip },
    "resendOtp.createOtp",
  );
  if (!otp) {
    return actionError(
      "Не удалось отправить код. Попробуйте ещё раз через несколько минут.",
    );
  }

  // В отличие от login.ts/register.ts, здесь безопасно вернуть actionError:
  // это отдельное действие на уже отрисованном экране OTP (кнопка «отправить
  // код повторно»), а не форма, которая должна куда-то навигировать по
  // success — пользователь просто видит сообщение об ошибке и может нажать
  // кнопку ещё раз.
  try {
    await notifyOtpCode({ to: userEmail, code: otp, purpose: type as OtpType });
  } catch {
    return actionError(
      "Не удалось отправить код. Попробуйте ещё раз через несколько минут.",
    );
  }

  return actionSuccess({ message: "Код отправлен повторно" });
}
