import type { Admin, User } from "@/payload-types";
import { SupportError } from "./errors.ts";

/**
 * Кто выполняет операцию чата. Определяется один раз — при подключении к
 * шлюзу или в обработчике запроса — и дальше передаётся явно.
 *
 * Покупатель и менеджер — разные коллекции Payload, и id у них пересекаются:
 * users#5 и admins#5 — разные люди. Поэтому вид участника хранится вместе с
 * id и сравнивается всегда парой.
 */
export type SupportActor =
	| {
			kind: "customer";
			userId: number;
			name: string;
			email: string;
			/** Запрещено писать в чат (users.supportChatBanned). */
			chatBanned: boolean;
	  }
	| {
			kind: "staff";
			adminId: number;
			name: string;
			role: "admin" | "superadmin";
	  };

/** Текст для покупателя, которому запрещено писать в чат. */
export const CHAT_BANNED_MESSAGE =
	"Писать в чат сейчас нельзя. Свяжитесь с нами по телефону или через страницу контактов.";

export type CustomerActor = Extract<SupportActor, { kind: "customer" }>;
export type StaffActor = Extract<SupportActor, { kind: "staff" }>;

/**
 * Покупатель, которого пускают в чат: активный аккаунт.
 * Та же граница, что в getAuthenticatedUserFromHeaders (modules/auth): блокировка
 * действует на всех транспортах сразу, а не с истечением токена.
 */
export function customerActorFromUser(user: User): CustomerActor | null {
	if (user.status === "blocked" || user.status === "suspended") return null;
	return {
		kind: "customer",
		userId: Number(user.id),
		name: user.name,
		email: user.email,
		chatBanned: user.supportChatBanned === true,
	};
}

/**
 * Менеджер чата — любой сотрудник с доступом в админку (решение владельца,
 * 11.10.2026: новый администратор = новый менеджер). Роль проверяется тем же
 * списком, что даёт доступ к панели (STAFF_ROLES), а не полем «менеджер».
 */
export function staffActorFromAdmin(admin: Admin): StaffActor | null {
	if (admin.role !== "admin" && admin.role !== "superadmin") return null;
	return {
		kind: "staff",
		adminId: Number(admin.id),
		name: admin.support?.displayName?.trim() || admin.name,
		role: admin.role,
	};
}

/**
 * Единственная проверка «можно ли этому участнику в этот диалог» — для
 * шлюза, HTTP и вложений. Персонал видит все диалоги; покупатель — только
 * свои. Диалог обезличенного аккаунта (user_id = null) покупателю не
 * принадлежит никогда.
 */
export function canAccessConversation(
	actor: SupportActor,
	conversation: { userId: number | null },
): boolean {
	if (actor.kind === "staff") return true;
	return conversation.userId !== null && conversation.userId === actor.userId;
}

export function assertCanAccessConversation(
	actor: SupportActor,
	conversation: { userId: number | null } | null,
): asserts conversation is { userId: number | null } {
	// «Нет такого» и «чужой» неразличимы снаружи: иначе перебором id можно
	// узнать, сколько диалогов в системе и какие из них существуют.
	if (!conversation || !canAccessConversation(actor, conversation)) {
		throw new SupportError("not_found", "Диалог не найден");
	}
}
