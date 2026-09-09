import { getEmailConfig } from "./config.ts";
import { EmailDeliveryError, EmailTemplateError } from "./errors.ts";
import { emailLogger } from "./logger.ts";
import { getEmailTransporter } from "./transport.ts";
import type {
	EmailAddress,
	EmailTemplate,
	RenderedEmail,
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

		let rendered: RenderedEmail;
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

		// Каждому получателю — отдельное письмо, а не один конверт со списком
		// в To.
		//
		// Так было раньше, и это давало ровно ту картину, с которой пришла
		// задача: «письмо получил только один из администраторов». Один
		// конверт на всех — это одна SMTP-транзакция: если сервер отвечает
		// отказом на чей-то RCPT TO (адрес с опечаткой, переполненный ящик,
		// греи-листинг), под удар попадает вся рассылка, а `info.rejected`
		// никто не проверял — в журнале оставалась запись «письмо успешно
		// отправлено».
		//
		// Отдельные письма изолируют получателей друг от друга (у каждого
		// свои ретраи) и заодно перестают показывать всему персоналу список
		// служебных адресов в шапке письма.
		const results = await Promise.all(
			recipients.map((recipient) =>
				this.deliverTo(recipient, template.id, rendered, options.replyTo),
			),
		);

		const delivered = results.filter((r) => r.success);
		const failed = results.filter((r) => !r.success);
		const attempts = results.reduce((sum, r) => sum + r.attempts, 0);

		if (failed.length > 0) {
			emailLogger.error("Письмо доставлено не всем получателям", {
				templateId: template.id,
				deliveredTo: delivered.map((r) => r.recipient.email),
				failedFor: failed.map((r) => r.recipient.email),
			});
		}

		// Провал ВСЕХ адресов — это отказ отправки, и он должен всплыть
		// исключением, как раньше (на этом построена обработка ошибок в
		// notify*-сервисах). Частичная доставка исключением не является:
		// остановить её уже нельзя, а терять доставленные письма из-за
		// одного плохого адреса — хуже, чем сообщить о нём в журнал.
		if (delivered.length === 0) {
			throw new EmailDeliveryError(
				`Не удалось отправить письмо по шаблону "${template.id}" ни одному из ${recipients.length} получателей`,
				attempts,
				{ cause: failed[0]?.error },
			);
		}

		return {
			success: failed.length === 0,
			messageId: delivered[0]?.messageId,
			attempts,
		};
	}

	/** Доставка одному адресату с ретраями. Не бросает — возвращает исход. */
	private async deliverTo(
		recipient: EmailAddress,
		templateId: string,
		rendered: RenderedEmail,
		replyTo: string | undefined,
	): Promise<{
		recipient: EmailAddress;
		success: boolean;
		messageId?: string;
		attempts: number;
		error?: unknown;
	}> {
		const config = getEmailConfig();
		const transporter = getEmailTransporter();
		const from = formatAddress({
			email: config.EMAIL_FROM_ADDRESS,
			name: config.EMAIL_FROM_NAME,
		});
		const maxAttempts = config.EMAIL_MAX_RETRIES + 1;

		let lastError: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const info = await transporter.sendMail({
					from,
					to: formatAddress(recipient),
					replyTo,
					subject: rendered.subject,
					html: rendered.html,
					text: rendered.text,
				});

				// nodemailer резолвит промис и тогда, когда сервер принял
				// письмо не для всех адресов. Раньше этот случай уходил в лог
				// как успех — теперь считаем отказом и ретраим.
				if (info.rejected?.length) {
					throw new Error(
						`SMTP-сервер отклонил адрес: ${info.rejected.join(", ")}${
							info.response ? ` (${info.response})` : ""
						}`,
					);
				}

				emailLogger.info("Письмо успешно отправлено", {
					templateId,
					recipient: recipient.email,
					messageId: info.messageId,
					attempt,
				});

				return {
					recipient,
					success: true,
					messageId: info.messageId,
					attempts: attempt,
				};
			} catch (error) {
				lastError = error;
				emailLogger.warn("Попытка отправки письма завершилась ошибкой", {
					templateId,
					recipient: recipient.email,
					attempt,
					maxAttempts,
					error: error instanceof Error ? error.message : String(error),
				});
				if (attempt < maxAttempts)
					await delay(config.EMAIL_RETRY_DELAY_MS * attempt);
			}
		}

		emailLogger.error("Не удалось отправить письмо после всех попыток", {
			templateId,
			recipient: recipient.email,
			attempts: maxAttempts,
		});

		return {
			recipient,
			success: false,
			attempts: maxAttempts,
			error: lastError,
		};
	}
}

export const emailService = new EmailService();
