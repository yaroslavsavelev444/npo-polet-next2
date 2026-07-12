// src/env.ts
import { z } from "zod";

/**
 * Схема для серверных переменных (доступны только в Node.js / API routes / Server Components)
 */
const serverSchema = z.object({
  // Payload
  PAYLOAD_SECRET: z.string().min(1),

  // База данных
  DATABASE_URI: z.string().url(),

  // Redis (для BullMQ)
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),

  // Node env
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ── CORS / CSRF ──────────────────────────────────────────────────────────
  // Список через запятую, например: "https://test.npo-polet.ru,https://admin.npo-polet.ru".
  // Payload использует это ОДНО значение и для `cors`, и для `csrf` (см.
  // payload.config.ts). Если Origin входящего запроса не входит в этот
  // список, Payload молча отбрасывает JWT из cookie (см.
  // node_modules/payload/dist/auth/extractJWT.js) — запрос выглядит как
  // неавторизованный (req.user === null), хотя cookie в браузере валидна.
  // Ровно это происходило в проде с admin.npo-polet.ru, когда админский
  // origin забыли добавить в переменную при активации поддомена: 403 при
  // сохранении в админке и 400 ("No User") при logout — Payload просто не
  // видел пользователя ни в одном из этих запросов.
  ALLOWED_ORIGINS: z.string().optional().default(""),

  // Хост админки, например: "admin.npo-polet.ru" (без протокола). Используется
  // proxy.ts для маршрутизации и ниже — чтобы на старте процесса проверить,
  // что соответствующий https-origin присутствует в ALLOWED_ORIGINS.
  ADMIN_HOSTNAME: z.string().optional(),

  // Внешние сервисы
  RESEND_API_KEY: z.string().optional(),
});

/**
 * Схема для клиентских переменных (должны иметь префикс NEXT_PUBLIC_)
 */
const clientSchema = z.object({
  // Единственный источник правды для абсолютного адреса приложения.
  // Используется: payload.config.ts (serverURL для абсолютных URL медиа),
  // письма (ссылки восстановления пароля и т.д.), email/config.ts.
  // В dev по умолчанию localhost:3000, в проде ОБЯЗАН быть переопределён
  // на реальный домен (https://test.npo-polet.ru) через .env.production.
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

/**
 * Функция для валидации и парсинга переменных окружения
 */
function buildEnv() {
  // Собираем все переменные
  const serverEnv = {
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
    DATABASE_URI: process.env.DATABASE_URI,
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    ADMIN_HOSTNAME: process.env.ADMIN_HOSTNAME,
  };

  const clientEnv = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };

  // Парсим серверные переменные (только если запущено на сервере)
  const parsedServer = serverSchema.safeParse(serverEnv);
  if (!parsedServer.success) {
    console.error(
      "❌ Ошибка валидации серверных переменных окружения:",
      parsedServer.error.format(),
    );
    // В проде лучше выбрасывать ошибку, чтобы не запускать приложение с невалидным конфигом
    throw new Error("Invalid server environment variables");
  }

  // Кросс-проверка ALLOWED_ORIGINS/ADMIN_HOSTNAME: если админский поддомен
  // уже сконфигурирован (ADMIN_HOSTNAME задан), его https-origin ОБЯЗАН
  // присутствовать в ALLOWED_ORIGINS, иначе Payload будет молча отклонять
  // все запросы из админки как неавторизованные (см. комментарий у
  // ALLOWED_ORIGINS выше). Проверяем только в production и только когда
  // ADMIN_HOSTNAME реально задан — на этапе, пока поддомен ещё не поднят
  // (ADMIN_HOSTNAME пуст), эта проверка не мешает.
  if (
    parsedServer.data.NODE_ENV === "production" &&
    parsedServer.data.ADMIN_HOSTNAME
  ) {
    const adminOrigin = `https://${parsedServer.data.ADMIN_HOSTNAME}`;
    const allowedOrigins = parsedServer.data.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (!allowedOrigins.includes(adminOrigin)) {
      console.error(
        `❌ ADMIN_HOSTNAME=${parsedServer.data.ADMIN_HOSTNAME} задан, но ${adminOrigin} отсутствует в ALLOWED_ORIGINS ` +
          `(сейчас: "${parsedServer.data.ALLOWED_ORIGINS}"). Без этого Payload будет ` +
          "отклонять запросы из админки (403 при сохранении, 400 при logout), " +
          "потому что не сможет извлечь JWT из cookie для этого Origin.",
      );
      throw new Error(
        `ALLOWED_ORIGINS должен включать ${adminOrigin} — добавьте его в .env.production`,
      );
    }
  }

  // Клиентские переменные (доступны и на клиенте, но валидируем везде)
  const parsedClient = clientSchema.safeParse(clientEnv);
  if (!parsedClient.success) {
    console.error(
      "❌ Ошибка валидации клиентских переменных окружения:",
      parsedClient.error.format(),
    );
    if (typeof window === "undefined") {
      throw new Error("Invalid client environment variables");
    }
  }
  //
  return {
    ...parsedServer.data,
    ...parsedClient.data,
  };
}

/**
 * Экспортируем единый объект env.
 * На клиенте серверные переменные будут undefined (но мы их не используем на клиенте),
 * а клиентские – доступны.
 */
export const env = buildEnv();

// Дополнительно экспортируем типы для удобства
export type Env = typeof env;
