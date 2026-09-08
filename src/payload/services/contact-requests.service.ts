// services/contact-requests.service.ts
import type { ContactRequest } from "../../../payload-types";
import { getPayloadInstance } from "./getPayload";

export interface CreateContactRequestInput {
	name: string;
	email: string;
	message: string;
	/** Момент подтверждения согласия. Ставит сервер, не клиент. */
	consentAcceptedAt: Date;
	/** Slug соглашения, на которое ссылалась форма. */
	consentDocument: string;
	userAgent?: string;
}

/**
 * Создаёт обращение со страницы контактов.
 *
 * `overrideAccess: true` — намеренно: create в коллекции закрыт (() => false),
 * единственный легитимный путь проходит через server action
 * submitContactRequestAction, который уже выполнил валидацию и rate-limit.
 * Так прямой POST на /api/contact-requests невозможен, а форму при этом может
 * отправить любой посетитель, включая неавторизованного.
 */
export async function createContactRequest(
	input: CreateContactRequestInput,
): Promise<ContactRequest> {
	const payload = await getPayloadInstance();

	const doc = await payload.create({
		collection: "contact-requests",
		overrideAccess: true,
		data: {
			name: input.name,
			email: input.email,
			message: input.message,
			consentAcceptedAt: input.consentAcceptedAt.toISOString(),
			consentDocument: input.consentDocument,
			userAgent: input.userAgent,
			status: "new",
		},
	});

	return doc as unknown as ContactRequest;
}
