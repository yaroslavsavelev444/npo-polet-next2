// services/contact-requests.service.ts
import type { ContactRequest } from "../../../payload-types";
import { getPayloadInstance } from "./getPayload";

export interface CreateContactRequestInput {
	topic: ContactRequest["topic"];
	name: string;
	/** Не спрашивается в заявке на товар. */
	email?: string;
	phone?: string;
	/** В заявке на товар — необязательный комментарий. */
	message?: string;
	/** Заявка на товар: сам товар и количество. */
	product?: number;
	quantity?: number;
	/** Аккаунт отправителя, если он авторизован. */
	user?: number;
	/** Момент подтверждения согласия. Ставит сервер, не клиент. */
	consentAcceptedAt: Date;
	/** Slug соглашения, на которое ссылалась форма. */
	consentDocument: string;
	userAgent?: string;
}

/**
 * Создаёт обращение: со страницы контактов, заявку на 3D-печать или заявку
 * на товар.
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
			topic: input.topic,
			name: input.name,
			email: input.email,
			phone: input.phone,
			message: input.message,
			product: input.product,
			quantity: input.quantity,
			user: input.user,
			consentAcceptedAt: input.consentAcceptedAt.toISOString(),
			consentDocument: input.consentDocument,
			userAgent: input.userAgent,
			status: "new",
		},
	});

	return doc as unknown as ContactRequest;
}
