import type { BasePayload } from "payload";
import type { OAuthProviderId } from "./types";

/**
 * Операции с коллекцией user-identities. Всё через Local API с
 * overrideAccess: снаружи коллекция закрыта на запись для всех (см. её шапку).
 */

export interface IdentityRow {
	id: number;
	userId: number;
	provider: OAuthProviderId;
	emailAtLink: string | null;
	lastUsedAt: string | null;
	createdAt: string;
}

function toRow(doc: Record<string, unknown>): IdentityRow {
	const user = doc.user as number | { id: number };
	return {
		id: Number(doc.id),
		userId: Number(typeof user === "object" ? user.id : user),
		provider: doc.provider as OAuthProviderId,
		emailAtLink: (doc.emailAtLink as string | null) ?? null,
		lastUsedAt: (doc.lastUsedAt as string | null) ?? null,
		createdAt: String(doc.createdAt),
	};
}

export async function findIdentity(
	payload: BasePayload,
	provider: OAuthProviderId,
	subject: string,
): Promise<IdentityRow | null> {
	const { docs } = await payload.find({
		collection: "user-identities",
		where: {
			and: [
				{ provider: { equals: provider } },
				{ subject: { equals: subject } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return docs[0] ? toRow(docs[0] as unknown as Record<string, unknown>) : null;
}

export async function listIdentities(
	payload: BasePayload,
	userId: number | string,
): Promise<IdentityRow[]> {
	const { docs } = await payload.find({
		collection: "user-identities",
		where: { user: { equals: Number(userId) } },
		depth: 0,
		limit: 10,
		sort: "createdAt",
		overrideAccess: true,
	});
	return docs.map((d) => toRow(d as unknown as Record<string, unknown>));
}

export type LinkResult =
	| { ok: true; identity: IdentityRow; created: boolean }
	/** Этот аккаунт сервиса уже привязан к ДРУГОМУ пользователю. */
	| { ok: false; reason: "linked_elsewhere" };

/**
 * Привязывает аккаунт сервиса к пользователю. Идемпотентно: повтор для того же
 * пользователя — успех без изменений. Гонку двух вкладок ловит уникальный
 * индекс (provider, subject): проигравшая перечитывает и решает заново.
 *
 * Привязать второй Яндекс к тому же пользователю можно (несколько строк на
 * одного пользователя), но интерфейс кабинета этого не предлагает.
 */
export async function linkIdentity(
	payload: BasePayload,
	params: {
		userId: number | string;
		provider: OAuthProviderId;
		subject: string;
		email: string | null;
	},
): Promise<LinkResult> {
	const existing = await findIdentity(payload, params.provider, params.subject);
	if (existing) {
		return existing.userId === Number(params.userId)
			? { ok: true, identity: existing, created: false }
			: { ok: false, reason: "linked_elsewhere" };
	}

	try {
		const doc = await payload.create({
			collection: "user-identities",
			data: {
				user: Number(params.userId),
				provider: params.provider,
				subject: params.subject,
				emailAtLink: params.email,
				lastUsedAt: new Date().toISOString(),
			},
			depth: 0,
			overrideAccess: true,
		});
		return {
			ok: true,
			identity: toRow(doc as unknown as Record<string, unknown>),
			created: true,
		};
	} catch (err) {
		const raced = await findIdentity(payload, params.provider, params.subject);
		if (!raced) throw err;
		return raced.userId === Number(params.userId)
			? { ok: true, identity: raced, created: false }
			: { ok: false, reason: "linked_elsewhere" };
	}
}

export async function touchIdentity(
	payload: BasePayload,
	identityId: number,
): Promise<void> {
	await payload.update({
		collection: "user-identities",
		id: identityId,
		data: { lastUsedAt: new Date().toISOString() },
		depth: 0,
		overrideAccess: true,
	});
}

/** Отвязка из кабинета; удаляет только запись этого пользователя. */
export async function unlinkIdentity(
	payload: BasePayload,
	userId: number | string,
	identityId: number,
): Promise<boolean> {
	const { docs } = await payload.delete({
		collection: "user-identities",
		where: {
			and: [
				{ id: { equals: identityId } },
				{ user: { equals: Number(userId) } },
			],
		},
		depth: 0,
		overrideAccess: true,
	});
	return docs.length > 0;
}
