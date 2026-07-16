import type { BasePayload } from "payload";
import { createOtp } from "./OtpStore";
import type { AuthErrorCode } from "../types";
import type { OtpType } from "../types";

/**
 * Payload с Turbopack грузит несколько независимых копий пакета `payload`
 * в разные server-чанки (dual-package hazard) — `err instanceof LockedAuth`,
 * импортированный здесь, ложно возвращает false для инстанса, брошенного
 * из чанка самого Payload, хотя это тот же класс по имени (проверено
 * эмпирически: err.constructor.name === 'LockedAuth', но instanceof — нет).
 * `.name` — обычная строка, простановка которой не зависит от идентичности
 * класса, поэтому сверяем по нему. Для собственных ошибок (AccountBlocked/
 * SuspendedError) это не обязательно (единая точка импорта — App-код, не
 * зависимость), но используем тот же приём для единообразия и на случай
 * похожего дублирования модулей в будущем.
 */
function errorNameIs(err: unknown, name: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === name
  );
}

/**
 * Достаёт пути невалидных полей из ошибки Payload (ValidationError и её
 * производных — например unique-constraint violation на Postgres/SQLite,
 * см. @payloadcms/drizzle/upsertRow/handleUpsertError.js). Формат ошибки
 * там не содержит "duplicate"/"unique" в message, только структурированный
 * data.errors — поэтому подобные проверки нельзя делать через err.message.
 */
export function extractPayloadErrorFieldPaths(err: unknown): string[] {
  const data = (err as { data?: { errors?: unknown } } | null | undefined)
    ?.data;
  const errors = data?.errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((e) => (e && typeof e === "object" && "path" in e ? e.path : null))
    .filter((p): p is string => typeof p === "string");
}

export function isFieldTakenError(err: unknown, fieldName: string): boolean {
  if (err instanceof Error) {
    if (
      err.message.includes("duplicate") ||
      err.message.includes("unique") ||
      err.message.includes("already exists")
    ) {
      return true;
    }
  }
  return extractPayloadErrorFieldPaths(err).includes(fieldName);
}

/**
 * Логирует неожиданную (не бизнес-) ошибку с контекстом — чтобы «тихий»
 * catch никогда не проглатывал причину молча, и её можно было найти в
 * логах сервера при разборе инцидента.
 */
export function logUnexpectedAuthError(scope: string, err: unknown): void {
  console.error(`[auth:${scope}]`, err);
}

export interface AuthErrorClassification {
  code: AuthErrorCode;
  message: string;
}

/**
 * Классифицирует ошибку payload.login()/legacy-fallback в код и
 * пользовательское сообщение.
 *
 * Пароль подтверждается ДО beforeLogin-хуков (см.
 * node_modules/payload/dist/auth/operations/login.js) — то есть
 * AccountBlockedError/AccountSuspendedError долетают только когда пароль
 * был верным, а LockedAuth Payload бросает сам (используя встроенный
 * maxLoginAttempts/lockTime), даже раньше проверки пароля. Всё остальное
 * (включая AuthenticationError — неверный email/пароль, либо email не
 * найден) намеренно сводится к одному нейтральному сообщению: раздельные
 * тексты "неверный пароль" / "такого email нет" позволяют перебором
 * узнавать, какие email зарегистрированы.
 */
export function classifyLoginError(err: unknown): AuthErrorClassification {
  if (errorNameIs(err, "LockedAuth")) {
    return {
      code: "account_locked",
      message:
        "Слишком много неудачных попыток входа. Аккаунт временно заблокирован, попробуйте позже.",
    };
  }
  if (errorNameIs(err, "AccountBlockedError")) {
    return {
      code: "account_blocked",
      message: (err as Error).message,
    };
  }
  if (errorNameIs(err, "AccountSuspendedError")) {
    return {
      code: "account_suspended",
      message: (err as Error).message,
    };
  }
  // AuthenticationError (неверный email/пароль) попадает сюда же, в default.
  // Его бросает и requireServerAuthFlow, когда payload.login() вызван без
  // AUTH_FLOW_CONTEXT — намеренно неотличимо для клиента (см. докстринг хука);
  // настоящая причина в таком случае пишется в лог сервера.
  return { code: "invalid_credentials", message: "Неверный email или пароль" };
}

/**
 * Создаёт OTP, но не даёт сбою (например, недоступности БД) уронить
 * рендер Server Action необработанным исключением — то же самое, что
 * произошло с email-уведомлением при регистрации до этого фикса (см.
 * комментарий в register.ts). В отличие от отправки письма, здесь
 * действительно нечего показывать пользователю без OTP-записи, поэтому
 * вызывающий код должен вернуть actionError и не пускать на экран ввода
 * кода.
 */
export async function safeCreateOtp(
  payload: BasePayload,
  args: { userId: string | number; type: OtpType; ip: string },
  scope: string,
): Promise<string | null> {
  try {
    return await createOtp(payload, args);
  } catch (err) {
    logUnexpectedAuthError(scope, err);
    return null;
  }
}
