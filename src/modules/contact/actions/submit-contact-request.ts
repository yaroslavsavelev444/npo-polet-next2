"use server";

import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { createContactRequest } from "@/payload/services/contact-requests.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyNewContactRequest } from "@/services/notifications/notifyNewContactRequest";
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
 * Приём сообщения с формы на странице контактов.
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

	const { name, email, message } = parsed.data;
	const consentAcceptedAt = new Date();

	let requestId: number | string;
	try {
		const created = await createContactRequest({
			name,
			email,
			message,
			consentAcceptedAt,
			consentDocument: PERSONAL_DATA_CONSENT_SLUG,
			userAgent,
		});
		requestId = created.id;
	} catch (error) {
		console.error("[contact-request] create failed", error);
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
			name,
			email,
			message,
			consentAcceptedAt,
			consentDocument: PERSONAL_DATA_CONSENT_SLUG,
		},
		payload,
	);

	return { success: true };
}
