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
  // Внешние сервисы
  RESEND_API_KEY: z.string().optional(),

  // Node env
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

/**
 * Схема для клиентских переменных (должны иметь префикс NEXT_PUBLIC_)
 */
const clientSchema = z.object({
  //   NEXT_PUBLIC_PAYLOAD_URL: z.string().url(),
  //   NEXT_PUBLIC_APP_URL: z.string().url(),
  // другие публичные переменные, если есть
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
  };

  const clientEnv = {
    // NEXT_PUBLIC_PAYLOAD_URL: process.env.NEXT_PUBLIC_PAYLOAD_URL,
    // NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
