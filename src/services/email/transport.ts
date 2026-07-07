import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig } from "./config.ts";

let cachedTransporter: Transporter | null = null;

/**
 * Singleton-транспорт nodemailer. Пересоздаётся один раз на процесс, чтобы
 * переиспользовать пул TLS-соединений между письмами, а не открывать новое
 * соединение на каждую отправку.
 */
export function getEmailTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const config = getEmailConfig();
  cachedTransporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.smtpSecure,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  });

  return cachedTransporter;
}

export function __resetEmailTransporterCacheForTests(): void {
  cachedTransporter = null;
}
