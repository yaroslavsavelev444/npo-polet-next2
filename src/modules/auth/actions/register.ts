"use server";

import { cookies } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import {
  isFieldTakenError,
  logUnexpectedAuthError,
  safeCreateOtp,
} from "../lib/errorHandling";
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
      "validation",
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
    return actionError("Некорректные данные согласий", undefined, "validation");
  }

  const { ip, userAgent } = await getRequestMeta();

  // 2. Rate limit
  const rl = await RATE_LIMITS.register(ip);
  if (!rl.allowed) {
    return actionError(
      "Слишком много попыток регистрации. Попробуйте позже.",
      undefined,
      "rate_limited",
    );
  }

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
    return actionError(
      "Необходимо принять все обязательные соглашения",
      { consents: [`Не приняты: ${missing.join(", ")}`] },
      "validation",
    );
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
    if (isFieldTakenError(err, "email")) {
      return actionError(
        "Пользователь с таким email уже зарегистрирован.",
        undefined,
        "email_taken",
      );
    }
    // Любая другая ошибка создания (неожиданная валидация Payload, сбой БД
    // и т.п.) раньше пробрасывалась дальше (`throw err`) и роняла рендер
    // Server Action в error boundary. Показываем нейтральное сообщение и
    // логируем причину для разбора — учётка при этом не создаётся, так что
    // ничего откатывать не нужно.
    logUnexpectedAuthError("register.createUser", err);
    return actionError(
      "Не удалось создать аккаунт. Попробуйте позже.",
      undefined,
      "server_error",
    );
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
    logUnexpectedAuthError("register.loginAfterCreate", err);
  }

  // 6. Создаём сессию — необязательный для дальнейшего флоу артефакт
  // (verifyOtpAction работает и без cookie session-id), поэтому сбой здесь
  // не должен ронять уже состоявшуюся регистрацию.
  const cookieStore = await cookies();
  try {
    const session = await createSession(payload, {
      userId: String(user.id),
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
  } catch (err) {
    logUnexpectedAuthError("register.createSession", err);
  }

  // 7. Фиксируем принятые согласия
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

  // 8. OTP для верификации email. Без самой OTP-записи пользователю нечего
  // будет ввести на следующем экране, поэтому (в отличие от отправки письма
  // ниже) сбой здесь должен остановить флоу — но не откатывать уже
  // созданный аккаунт/сессию/согласия, это необратимые побочные эффекты
  // (см. также комментарий у notifyOtpCode ниже).
  const otp = await safeCreateOtp(
    payload,
    { userId: String(user.id), type: "email_verify", ip },
    "register.createOtp",
  );
  if (!otp) {
    return actionError(
      "Аккаунт создан, но не удалось отправить код подтверждения. Войдите, чтобы запросить код повторно.",
      undefined,
      "server_error",
    );
  }

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
    logUnexpectedAuthError("register.notifyOtpCode", err);
  }

  return actionSuccess<RegisterResult>({ requiresOtp: true });
}
