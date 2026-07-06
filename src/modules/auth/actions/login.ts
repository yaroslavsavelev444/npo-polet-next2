"use server";

import { cookies } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyAccountLocked } from "@/services/notifications/notifyAccountLocked";
import { notifyNewSessionLogin } from "@/services/notifications/notifyNewSessionLogin";
import { sendOtpEmail } from "../lib/email";
import { createOtp } from "../lib/OtpStore";
import { RATE_LIMITS } from "../lib/rateLimit";
import { createSession, parseDeviceLabel } from "../lib/session";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import { loginSchema } from "../schemas/login.schema";
import type { LoginResult } from "../types";

/**
 * Server Action: вход пользователя.
 *
 * Поток:
 * 1. Валидация
 * 2. Rate limit по IP
 * 3. payload.login() — проверяет пароль, возвращает JWT token
 * 4. Вручную ставим cookie payload-token (в Server Actions Payload не ставит сам)
 * 5. Сбрасываем loginAttempts
 * 6. Генерируем OTP login_2fa + отправляем email
 * 7. Создаём Session запись
 * 8. Ставим session-id cookie
 * 9. Возвращаем requiresOtp: true
 *
 * ВАЖНО про cookie в Server Actions:
 * payload.login() возвращает { token, user } — token это JWT строка.
 * Cookie НЕ ставится автоматически в контексте Server Action (только в Route Handler).
 * Поэтому ставим вручную через next/headers cookies().
 */
export async function loginAction(_prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionError(
      "Проверьте введённые данные",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { email, password } = parsed.data;
  const { ip, userAgent } = await getRequestMeta();

  const rl = await RATE_LIMITS.login(ip);
  // if (!rl.allowed) {
  //   return actionError("Слишком много попыток входа. Попробуйте через час.");
  // }

  const payload = await getPayloadInstance();

  // payload.login() — Payload проверяет пароль через bcrypt
  // Возвращает { token: string, user, exp }
  // Не передаём req — в Server Action он не нужен для получения token
  let loginToken: string;
  let userId: string | number;

  const users = await payload.find({
    collection: "users",
    limit: 1000, // или другое большое число
    overrideAccess: true,
  });

  console.log(users.docs);

  console.log("users", users);
  try {
    const loginResult = await payload.login({
      collection: "users",
      data: { email, password },
    });

    void notifyNewSessionLogin({
      email,
      userName: loginResult.user.name as string,
      deviceLabel: parseDeviceLabel(userAgent), // уже есть в modules/auth/lib/session.ts
      ip,
    });

    if (!loginResult.token) {
      throw new Error("No token returned");
    }

    loginToken = loginResult.token;
    userId = loginResult.user.id;

    // Сбрасываем счётчик неверных попыток
    await payload.update({
      collection: "users",
      id: userId,
      data: {
        loginAttempts: 0,
        lockUntil: null,
        lastLoginAt: new Date().toISOString(),
      },
      overrideAccess: true,
    });
  } catch (err: unknown) {
    await handleFailedLogin(payload, email);
    return actionError("Неверный email или пароль");
  }

  // Ставим JWT cookie вручную
  // Имя 'payload-token' — стандартное имя которое использует Payload
  const cookieStore = await cookies();
  cookieStore.set("payload-token", loginToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 дней
  });

  // Генерируем OTP для второго фактора
  const otp = await createOtp(payload, {
    userId: String(userId),
    type: "login_2fa",
    ip,
  });

  await sendOtpEmail({ to: email, otp, type: "login_2fa" });

  // Создаём сессию
  const session = await createSession(payload, {
    userId: String(userId),
    ip,
    userAgent,
  });

  cookieStore.set("session-id", String(session.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return actionSuccess<LoginResult>({ requiresOtp: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function handleFailedLogin(
  payload: Awaited<ReturnType<typeof getPayloadInstance>>,
  email: string,
) {
  try {
    const { docs } = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    });

    if (docs.length === 0) return;

    const user = docs[0];
    const attempts = (user.loginAttempts ?? 0) + 1;

    const MAX_ATTEMPTS = 10;

    const isLocked = attempts >= MAX_ATTEMPTS;

    const lockUntil = isLocked
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;

    await payload.update({
      collection: "users",

      id: user.id,

      data: {
        loginAttempts: attempts,

        ...(isLocked && {
          lockUntil,
        }),
      },

      overrideAccess: true,
    });

    if (isLocked) {
      void notifyAccountLocked({
        email: user.email as string,

        userName: user.name as string,

        lockedUntil: lockUntil!,
      });
    }
  } catch {
    // Не раскрываем существование пользователя
  }
}
