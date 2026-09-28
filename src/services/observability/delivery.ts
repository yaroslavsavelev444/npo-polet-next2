import { emailService } from "../email/EmailService.ts";
import { EmailConfigError } from "../email/errors.ts";
import { errorAlertEmailTemplate } from "../email/templates/ops/error-alert.template.ts";
import type { EmailAddress, EmailTemplate } from "../email/types.ts";
import type { DeliveryResult, SafeAlert } from "./types.ts";

// Письмо дежурному.
//
// ─── Кому ───────────────────────────────────────────────────────────────────
//
// Адрес — переменная ERROR_ALERT_EMAIL (можно несколько через запятую), а не
// «все сотрудники из admins», как у писем о заказах: письмо об ошибке нужно
// ровно тогда, когда база может быть недоступна, а адресат — это владелец
// сайта или разработчик, а не отдел продаж.
//
// ─── Почему почта ───────────────────────────────────────────────────────────
//
// Письмо уходит через тот же SMTP, что и письма покупателям, — никакой новой
// обработки данных и никакого нового получателя. Состав письма при этом —
// только `SafeAlert` (белый список), так что персональных данных в почтовом
// ящике не появляется.
//
// ─── Не бросает ─────────────────────────────────────────────────────────────
//
// Возвращает `DeliveryResult`. Решение «повторить» принимает очередь
// (`queue.ts`): у неё три попытки с нарастающей паузой, а EmailService внутри
// каждой ещё сам делает свои ретраи.

export function getAlertRecipients(): EmailAddress[] {
	const raw = process.env.ERROR_ALERT_EMAIL ?? "";
	const seen = new Set<string>();
	const recipients: EmailAddress[] = [];

	for (const part of raw.split(/[,;\s]+/)) {
		const email = part.trim();
		if (!email || !email.includes("@")) continue;
		const key = email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		recipients.push({ email });
	}

	return recipients;
}

/** 5xx SMTP — постоянный отказ: адреса нет, домен отвергает отправителя. */
function isPermanent(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 3 && current; depth++) {
		if (current instanceof EmailConfigError) return true;
		const code = (current as { responseCode?: unknown }).responseCode;
		if (typeof code === "number" && code >= 500 && code < 600) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

function describe(error: unknown): string {
	return error instanceof Error
		? `${error.name}: ${error.message}`
		: String(error);
}

/** Отправить служебное письмо по шаблону на адреса дежурного. */
export async function sendOpsEmail<T>(
	template: EmailTemplate<T>,
	data: T,
): Promise<DeliveryResult> {
	const to = getAlertRecipients();

	if (to.length === 0) {
		return { status: "skipped", reason: "ERROR_ALERT_EMAIL не задан" };
	}

	try {
		const result = await emailService.send(template, data, { to });

		// EMAIL_ENABLED=false: EmailService честно ничего не отправил и вернул
		// успех. В журнале это должно выглядеть как «не отправлено», а не как
		// письмо, которого никто не получал.
		if (result.attempts === 0) {
			return { status: "skipped", reason: "EMAIL_ENABLED=false" };
		}

		return { status: "sent" };
	} catch (error) {
		return isPermanent(error)
			? { status: "permanent", reason: describe(error) }
			: { status: "retryable", reason: describe(error) };
	}
}

export function deliverAlert(alert: SafeAlert): Promise<DeliveryResult> {
	return sendOpsEmail(errorAlertEmailTemplate, alert);
}
