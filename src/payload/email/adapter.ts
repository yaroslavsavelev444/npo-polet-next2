import type { EmailAdapter } from "payload";
import { getEmailConfig } from "../../services/email/config.ts";
import { emailLogger } from "../../services/email/logger.ts";
import { getEmailTransporter } from "../../services/email/transport.ts";

/**
 * Email-адаптер Payload поверх того же nodemailer-транспорта, которым
 * пользуется весь остальной проект (src/services/email).
 *
 * ─── Зачем он вообще нужен ──────────────────────────────────────────────────
 *
 * Без поля `email` в конфиге Payload подставляет consoleEmailAdapter и на
 * каждом старте — в том числе в контейнере миграций, посреди выкладки —
 * печатает в лог:
 *
 *   WARN: No email adapter provided. Email will be written to console.
 *
 * Предупреждение не косметическое: оно означает, что письмо, отправленное
 * внутренними механизмами Payload (сброс пароля из админки, подтверждение
 * адреса), не уходит никуда, а падает в stdout контейнера. Проект этого не
 * замечал только потому, что все СВОИ письма шлёт мимо Payload, через
 * EmailService, а payload.forgotPassword вызывается с disableEmail: true
 * (см. шапку auth в src/payload/collections/User.ts).
 *
 * ─── Почему не @payloadcms/email-nodemailer ─────────────────────────────────
 *
 * Пакет делал бы ровно это же, но завёл бы ВТОРОЙ транспорт nodemailer со
 * своим пулом соединений и своим чтением SMTP_*-переменных — рядом с уже
 * существующим singleton'ом из transport.ts. Настройки SMTP (в частности
 * вывод `secure` из порта 465, на котором однажды уже сломалась боевая
 * отправка) живут в одном месте — src/services/email/config.ts, — и второй
 * читатель тех же переменных этому только мешает.
 *
 * ─── Ленивость ──────────────────────────────────────────────────────────────
 *
 * getEmailConfig() валидирует SMTP_*-переменные и бросает, если их нет. Их
 * нет ни при `next build`, ни при `pnpm type-check`, ни в CI — поэтому он
 * вызывается только внутри sendEmail, при реальной отправке, а не при сборке
 * конфига. Значения по умолчанию для From читаются из process.env напрямую и
 * ни на что не влияют, пока письмо не отправляется.
 */
export const projectEmailAdapter: EmailAdapter<unknown> = () => ({
	name: "npo-polet-nodemailer",
	defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@localhost",
	defaultFromName: process.env.EMAIL_FROM_NAME ?? "НПО Полёт",

	async sendEmail(message) {
		const config = getEmailConfig();

		// EMAIL_ENABLED=false — режим разработки и тестов: адрес получателя в
		// тестовом заказе обычно не существует, и реальная отправка возвращает
		// отлуп в боевой почтовый ящик. Тот же выключатель уважает и
		// EmailService, так что поведение у обоих путей отправки одинаковое.
		if (!config.enabled) {
			emailLogger.info("Письмо Payload не отправлено (EMAIL_ENABLED=false)", {
				subject: message.subject,
			});
			return null;
		}

		return getEmailTransporter().sendMail({
			...message,
			from:
				message.from ??
				`"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM_ADDRESS}>`,
		});
	},
});
