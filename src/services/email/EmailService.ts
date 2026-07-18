import { getEmailConfig } from "./config.ts";
import { EmailDeliveryError, EmailTemplateError } from "./errors.ts";
import { emailLogger } from "./logger.ts";
import { getEmailTransporter } from "./transport.ts";
import type {
	EmailAddress,
	EmailTemplate,
	SendEmailOptions,
	SendEmailResult,
} from "./types.ts";

function normalizeRecipients(
	to: EmailAddress | EmailAddress[],
): EmailAddress[] {
	return Array.isArray(to) ? to : [to];
}

function formatAddress({ email, name }: EmailAddress): string {
	return name ? `"${name.replace(/"/g, "")}" <${email}>` : email;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Единственная точка отправки писем в проекте. Не знает о конкретных
 * бизнес-сценариях — принимает готовый шаблон, данные для него и
 * получателей. Инкапсулирует ретраи, логирование, мягкое отключение через
 * EMAIL_ENABLED (для dev/CI без настроенного SMTP).
 */
export class EmailService {
	async send<TData>(
		template: EmailTemplate<TData>,
		data: TData,
		options: SendEmailOptions,
	): Promise<SendEmailResult> {
		const config = getEmailConfig();
		const recipients = normalizeRecipients(options.to);

		if (recipients.length === 0) {
			emailLogger.warn("Отправка пропущена: список получателей пуст", {
				templateId: template.id,
			});
			return { success: false, attempts: 0 };
		}

		if (!config.enabled) {
			emailLogger.info("Email-модуль отключён (EMAIL_ENABLED=false)", {
				templateId: template.id,
				recipients: recipients.map((r) => r.email),
			});
			return { success: true, attempts: 0 };
		}

		let rendered;
		try {
			rendered = template.render(data);
		} catch (error) {
			emailLogger.error("Не удалось отрендерить шаблон письма", {
				templateId: template.id,
				error: error instanceof Error ? error.message : String(error),
			});
			throw new EmailTemplateError(
				`Ошибка рендеринга шаблона "${template.id}"`,
				{ cause: error },
			);
		}

		const transporter = getEmailTransporter();
		const from = formatAddress({
			email: config.EMAIL_FROM_ADDRESS, //
			name: config.EMAIL_FROM_NAME,
		});
		const to = recipients.map(formatAddress).join(", ");
		const maxAttempts = config.EMAIL_MAX_RETRIES + 1;

		let lastError: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const info = await transporter.sendMail({
					from,
					to,
					replyTo: options.replyTo,
					subject: rendered.subject,
					html: rendered.html,
					text: rendered.text,
				});

				emailLogger.info("Письмо успешно отправлено", {
					templateId: template.id,
					recipients: recipients.map((r) => r.email),
					messageId: info.messageId,
					attempt,
				});

				return { success: true, messageId: info.messageId, attempts: attempt };
			} catch (error) {
				lastError = error;
				emailLogger.warn("Попытка отправки письма завершилась ошибкой", {
					templateId: template.id,
					attempt,
					maxAttempts,
					error: error instanceof Error ? error.message : String(error),
				});
				if (attempt < maxAttempts)
					await delay(config.EMAIL_RETRY_DELAY_MS * attempt);
			}
		}

		emailLogger.error("Не удалось отправить письмо после всех попыток", {
			templateId: template.id,
			recipients: recipients.map((r) => r.email),
			attempts: maxAttempts,
		});

		throw new EmailDeliveryError(
			`Не удалось отправить письмо по шаблону "${template.id}" после ${maxAttempts} попыток`,
			maxAttempts,
			{ cause: lastError },
		);
	}
}

export const emailService = new EmailService();
