"use server";

import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { createContactRequest } from "@/payload/services/contact-requests.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyNewContactRequest } from "@/services/notifications/notifyNewContactRequest";
import { captureError } from "@/services/observability/capture";
import {
	contactRequestSchema,
	PERSONAL_DATA_CONSENT_SLUG,
} from "../schemas/contact-request.schema";

export type ContactRequestActionResult =
	| { success: true }
	| {
			success: false;
			error: string;
			code: "validation" | "rate_limited" | "server_error";
	  };

/**
 * Приём сообщения с сайта: форма на странице контактов и заявка на 3D-печать
 * с главной (одна форма, тема — поле `topic`).
 *
 * Единственная точка создания записи contact-requests: create в коллекции
 * закрыт, а сервис пишет с overrideAccess только после того, как здесь прошли
 * валидация и rate-limit.
 *
 * Клиентской валидации не доверяем и прогоняем ТУ ЖЕ схему заново — включая
 * согласие на обработку данных (`z.literal(true)`), поэтому запрос без
 * согласия не сможет создать запись, даже если форму отправили в обход
 * интерфейса.
 *
 * Отметка времени согласия и User-Agent берутся здесь, а не из тела запроса:
 * первое — потому что дату должен ставить тот, кто фиксирует факт, второе —
 * потому что заголовок запроса подделать с клиента нельзя.
 */
export async function submitContactRequestAction(
	input: unknown,
): Promise<ContactRequestActionResult> {
	const parsed = contactRequestSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			error: "Проверьте заполнение полей",
			code: "validation",
		};
	}

	const { ip, userAgent } = await getRequestMeta();

	const rl = await RATE_LIMITS.contactRequest(ip);
	if (!rl.allowed) {
		return {
			success: false,
			error:
				"Мы уже получили несколько сообщений с этого адреса. Попробуйте позже или позвоните.",
			code: "rate_limited",
		};
	}

	const { topic, name, email, message } = parsed.data;
	// Пустая строка из необязательного поля в базу не пишется: «телефон не
	// указан» — это отсутствие значения, а не пустой номер.
	const phone = parsed.data.phone || undefined;
	const consentAcceptedAt = new Date();

	let requestId: number | string;
	try {
		const created = await createContactRequest({
			topic,
			name,
			email,
			phone,
			message,
			consentAcceptedAt,
			consentDocument: PERSONAL_DATA_CONSENT_SLUG,
			userAgent,
		});
		requestId = created.id;
	} catch (error) {
		const errorId = captureError(error, {
			source: "action",
			module: "contact/submit-contact-request",
		});
		console.error("[contact-request] create failed", error, { errorId });
		return {
			success: false,
			error:
				"Не удалось отправить сообщение. Попробуйте ещё раз или позвоните.",
			code: "server_error",
		};
	}

	// notifyNewContactRequest не бросает: сообщение уже сохранено, и сбой почты
	// не должен превращаться в ошибку для отправителя — иначе он отправит
	// второй раз, и в админке появится дубль.
	const payload = await getPayloadInstance();
	await notifyNewContactRequest(
		{
			id: requestId,
			topic,
			name,
			email,
			phone,
			message,
			consentAcceptedAt,
			consentDocument: PERSONAL_DATA_CONSENT_SLUG,
		},
		payload,
	);

	return { success: true };
}
