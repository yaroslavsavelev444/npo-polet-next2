import { z } from "zod";
import { EmailConfigError } from "./errors.ts";

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? defaultValue : value === "true",
    );

const emailEnvSchema = z.object({
  SMTP_HOST: z.string().min(1, "SMTP_HOST обязателен"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // Не coerce'им в boolean сразу здесь: дефолт для secure зависит от порта
  // (см. ниже), поэтому "задан ли явно SMTP_SECURE" нужно знать отдельно
  // от его значения.
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().min(1, "SMTP_USER обязателен"),
  SMTP_PASSWORD: z.string().min(1, "SMTP_PASSWORD обязателен"),
  EMAIL_FROM_ADDRESS: z
    .string()
    .email("EMAIL_FROM_ADDRESS должен быть валидным email"),
  EMAIL_FROM_NAME: z.string().default("НПО Полёт"),
  EMAIL_ENABLED: booleanFromEnv(true),
  EMAIL_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  EMAIL_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export interface EmailConfig {
  SMTP_HOST: string;
  SMTP_PORT: number;
  smtpSecure: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  enabled: boolean;
  EMAIL_MAX_RETRIES: number;
  EMAIL_RETRY_DELAY_MS: number;
  appUrl: string;
}

let cachedConfig: EmailConfig | null = null;

/**
 * Ленивая (не при импорте модуля, а при первом send()) валидация конфига.
 * Кэшируется на процесс. Бросает понятную ошибку сразу, а не теряет письма
 * молча где-то в глубине попытки отправки.
 */
export function getEmailConfig(): EmailConfig {
  if (cachedConfig) return cachedConfig;

  const parsed = emailEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new EmailConfigError(
      `Некорректная конфигурация email-модуля: ${issues}`,
    );
  }

  // SMTP_SECURE не задан явно → выводим из порта: 465 — implicit TLS
  // (соединение сразу зашифровано), иначе (587/25 — STARTTLS) не шифруем
  // сразу. Порт 465 с secure:false ломает TLS-рукопожатие ещё на этапе
  // connect — именно так провалилась реальная отправка на проде (SMTP_PORT
  // = 465 в .env.production, SMTP_SECURE отсутствовал, дефолт был false).
  const smtpSecure =
    parsed.data.SMTP_SECURE !== undefined
      ? parsed.data.SMTP_SECURE === "true"
      : parsed.data.SMTP_PORT === 465;

  cachedConfig = {
    SMTP_HOST: parsed.data.SMTP_HOST,
    SMTP_PORT: parsed.data.SMTP_PORT,
    smtpSecure,
    SMTP_USER: parsed.data.SMTP_USER,
    SMTP_PASSWORD: parsed.data.SMTP_PASSWORD,
    EMAIL_FROM_ADDRESS: parsed.data.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: parsed.data.EMAIL_FROM_NAME,
    enabled: parsed.data.EMAIL_ENABLED,
    EMAIL_MAX_RETRIES: parsed.data.EMAIL_MAX_RETRIES,
    EMAIL_RETRY_DELAY_MS: parsed.data.EMAIL_RETRY_DELAY_MS,
    appUrl: parsed.data.NEXT_PUBLIC_APP_URL,
  };

  return cachedConfig;
}

export function __resetEmailConfigCacheForTests(): void {
  cachedConfig = null;
}
