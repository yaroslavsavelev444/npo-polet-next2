"use server";

import { cookies } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import { createOtp } from "../lib/OtpStore";
import { RATE_LIMITS } from "../lib/rateLimit";
import { createSession } from "../lib/session";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import {
  AcceptedConsentInput,
  acceptedConsentSchema,
  registerSchema,
} from "../schemas/register.schema";
import type { RegisterResult } from "../types";

export async function registerAction(_prevState: unknown, formData: FormData) {
  // 1. Валидация
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    name: formData.get("name"),
    consentsJson: formData.get("consentsJson"),
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError(
      "Проверьте введённые данные",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { email, password, name, consentsJson } = parsed.data;

  // Парсим согласия, убеждаясь, что consentId — число
  let acceptedConsents: AcceptedConsentInput[];
  try {
    const rawConsents = JSON.parse(consentsJson);
    acceptedConsents = rawConsents.map((c: unknown) =>
      acceptedConsentSchema.parse(c),
    );
  } catch {
    return actionError("Некорректные данные согласий");
  }

  const { ip, userAgent } = await getRequestMeta();

  // 2. Rate limit
  const rl = await RATE_LIMITS.register(ip);
  // if (!rl.allowed) {
  //   return actionError("Слишком много попыток. Попробуйте позже.");
  // }

  const payload = await getPayloadInstance();

  // 3. Проверяем обязательные согласия.
  // Критерии должны совпадать с теми, по которым страница регистрации
  // решает, какие согласия показывать пользователю (см. RegisterPage),
  // иначе бэкенд может требовать принятия согласий, которые фронт
  // никогда не показал как чекбокс (needsAcceptance: false).
  const { docs: requiredConsents } = await payload.find({
    collection: "consents",
    where: {
      and: [
        { isRequired: { equals: true } },
        { isActive: { equals: true } },
        { needsAcceptance: { equals: true } },
      ],
    },
    overrideAccess: true,
  });

  const requiredSlugs = requiredConsents.map((c) => c.slug as string);
  const acceptedSlugs = acceptedConsents.map((c) => c.slug);
  const missing = requiredSlugs.filter((s) => !acceptedSlugs.includes(s));

  if (missing.length > 0) {
    return actionError("Необходимо принять все обязательные соглашения", {
      consents: [`Не приняты: ${missing.join(", ")}`],
    });
  }

  // 4. Создаём пользователя (тип выводится автоматически)
  let user: Awaited<ReturnType<typeof payload.create>>;
  try {
    user = await payload.create({
      collection: "users",
      data: {
        email,
        password,
        name,
        role: "user",
        status: "active",
        twoFAVerified: false,
        emailVerified: false,
      },
      overrideAccess: true,
    });
  } catch (err: unknown) {
    if (isPayloadDuplicateError(err)) {
      return actionError("Не удалось создать аккаунт. Проверьте данные.");
    }
    throw err;
  }

  // 5. Логиним пользователя
  let loginToken: string | undefined;
  try {
    const loginResult = await payload.login({
      collection: "users",
      data: { email, password },
    });
    loginToken = loginResult.token;

    if (loginToken) {
      const cookieStore = await cookies();
      cookieStore.set("payload-token", loginToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }
  } catch (err) {
    console.error("[register] Login after create failed:", err);
  }

  // 6. Создаём сессию
  const session = await createSession(payload, {
    userId: String(user.id),
    ip,
    userAgent,
  });

  const cookieStore = await cookies();
  cookieStore.set("session-id", String(session.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  console.log("acceptedConsents", acceptedConsents);

  const allConsents = await payload.find({
    collection: "consents",

    limit: 100,

    overrideAccess: true,
  });

  console.log(
    "DB consents",

    allConsents.docs.map((c) => ({
      id: c.id,

      slug: c.slug,

      title: c.title,
    })),
  );

  await Promise.all(
    acceptedConsents.map((c) =>
      payload.create({
        collection: "user-consents",

        data: {
          user: user.id,

          consent: c.consentId,

          consentSlug: c.slug,

          version: c.version,

          acceptedAt: new Date().toISOString(),

          ip,

          userAgent,
        },

        overrideAccess: true,
      }),
    ),
  );

  // 8. OTP для верификации email
  const otp = await createOtp(payload, {
    userId: String(user.id),
    type: "email_verify",
    ip,
  });

  // Аккаунт, cookie-сессия и согласия уже созданы к этому моменту — это
  // необратимые побочные эффекты, которые Server Action не откатывает.
  // Раньше сбой отправки письма ронял весь рендер /auth/register (падение
  // происходило ещё раньше, при импорте modules/auth/lib/email.ts: там
  // `new Resend(process.env.RESEND_API_KEY)` вызывался на уровне модуля и
  // бросал исключение при отсутствующем ключе — модуль удалён, письма OTP
  // идут через centralized EmailService/Nodemailer). notifyOtpCode
  // намеренно прокидывает ошибку доставки дальше (см. её докстринг) — мы
  // ловим её здесь, логируем и всё равно пропускаем пользователя на экран
  // ввода кода: там есть кнопка «отправить код повторно» (resendOtpAction),
  // которой можно будет воспользоваться, когда почтовый сервис
  // восстановится. Возврат ошибки вместо этого не дал бы форме
  // регистрации перейти на экран OTP (см. RegisterForm.tsx — она
  // навигирует дальше только при success), оставив уже созданный аккаунт
  // в тупике.
  try {
    await notifyOtpCode({ to: email, code: otp, purpose: "email_verify" });
  } catch (err) {
    console.error(
      "[register] Не удалось отправить код подтверждения email:",
      err,
    );
  }

  return actionSuccess<RegisterResult>({ requiresOtp: true });
}

function isPayloadDuplicateError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes("duplicate") ||
      err.message.includes("unique") ||
      err.message.includes("already exists")
    );
  }
  return false;
}
