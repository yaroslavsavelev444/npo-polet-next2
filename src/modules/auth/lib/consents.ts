import type { BasePayload } from "payload";
import type { AcceptedConsentInput } from "../schemas/register.schema";
import type { ConsentListItem } from "../types";

/**
 * Согласия при регистрации — общее для обычной регистрации (registerAction,
 * /auth/register) и регистрации через Яндекс ID (oauth/actions.ts,
 * /auth/yandex/complete).
 *
 * Критерии «что показать» и «что обязательно» обязаны совпадать: иначе бэкенд
 * требовал бы принять согласие, которое форма никогда не показала чекбоксом
 * (needsAcceptance: false). Поэтому оба живут здесь, рядом.
 */

export async function listConsentsForAcceptance(
	payload: BasePayload,
): Promise<ConsentListItem[]> {
	const { docs } = await payload.find({
		collection: "consents",
		where: {
			and: [
				{ isActive: { equals: true } },
				{ needsAcceptance: { equals: true } },
			],
		},
		sort: "-isRequired", // Обязательные сначала
		limit: 20,
		overrideAccess: true,
	});

	return docs.map((c) => ({
		id: Number(c.id),
		slug: c.slug as string,
		title: c.title as string,
		version: (c.version ?? "1.0.0") as string,
		isRequired: (c.isRequired ?? false) as boolean,
		documentUrl: (c.documentUrl ?? null) as string | null,
	}));
}

/** Слаги обязательных согласий, которых нет среди принятых. */
export async function findMissingRequiredConsents(
	payload: BasePayload,
	accepted: AcceptedConsentInput[],
): Promise<string[]> {
	const { docs } = await payload.find({
		collection: "consents",
		where: {
			and: [
				{ isRequired: { equals: true } },
				{ isActive: { equals: true } },
				{ needsAcceptance: { equals: true } },
			],
		},
		overrideAccess: true,
	});
	const acceptedSlugs = new Set(accepted.map((c) => c.slug));
	return docs
		.map((c) => c.slug as string)
		.filter((slug) => !acceptedSlugs.has(slug));
}

export async function recordUserConsents(
	payload: BasePayload,
	params: {
		userId: number | string;
		accepted: AcceptedConsentInput[];
		ip: string;
		userAgent: string;
	},
): Promise<void> {
	const acceptedAt = new Date().toISOString();
	await Promise.all(
		params.accepted.map((c) =>
			payload.create({
				collection: "user-consents",
				data: {
					user: Number(params.userId),
					consent: c.consentId,
					consentSlug: c.slug,
					version: c.version,
					acceptedAt,
					ip: params.ip,
					userAgent: params.userAgent,
				},
				overrideAccess: true,
			}),
		),
	);
}
