import type { BasePayload } from "payload";
import { PERSONAL_DATA_CONSENT_SLUG } from "@/modules/contact/schemas/contact-request.schema";
import type { ConsentListItem } from "../types";

/**
 * Повторное согласие при привязке Яндекс ID к существующему аккаунту.
 *
 * Идентификатор учётной записи Яндекс ID появился в перечне ПД Согласия
 * (`personal-data`) только в редакции, опубликованной 14.10.2026. Покупатель,
 * принявший более раннюю редакцию, на обработку идентификатора не соглашался,
 * а ч. 1 ст. 9 152-ФЗ требует согласия конкретного — на перечисленные данные.
 * Наша Политика называет основанием для Яндекс ID согласие, поэтому перед
 * привязкой к такому аккаунту он принимает действующую редакцию.
 *
 * Новых аккаунтов это не касается: регистрация через Яндекс принимает
 * действующую редакцию в форме «имя + согласия».
 *
 * Спрашиваем ПОСЛЕ того, как личность подтверждена (сессия кабинета или код
 * на почту): иначе «согласие» за чужой аккаунт мог бы дать кто угодно.
 */
export const LINK_CONSENT_SLUG = PERSONAL_DATA_CONSENT_SLUG;

/**
 * Действующая редакция согласия, если покупатель её ещё не принимал.
 * Пусто — привязывать можно сразу (или документа нет в базе вовсе).
 */
export async function findOutdatedLinkConsents(
	payload: BasePayload,
	userId: number | string,
): Promise<ConsentListItem[]> {
	const { docs } = await payload.find({
		collection: "consents",
		where: {
			and: [
				{ slug: { equals: LINK_CONSENT_SLUG } },
				{ isActive: { equals: true } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const consent = docs[0];
	if (!consent) return [];

	const version = (consent.version ?? "1.0.0") as string;
	const accepted = await payload.find({
		collection: "user-consents",
		where: {
			and: [
				{ user: { equals: Number(userId) } },
				{ consentSlug: { equals: LINK_CONSENT_SLUG } },
				{ version: { equals: version } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (accepted.docs.length > 0) return [];

	return [
		{
			id: Number(consent.id),
			slug: consent.slug as string,
			title: consent.title as string,
			version,
			// Привязка без него не состоится — значит, обязательное, даже если
			// у документа в целом флажок «обязательный» не стоит.
			isRequired: true,
			documentUrl: (consent.documentUrl ?? null) as string | null,
		},
	];
}
