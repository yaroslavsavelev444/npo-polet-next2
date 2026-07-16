import type { Access, FieldAccess, PayloadRequest } from "payload";

type RequestUser = PayloadRequest["user"];

const STAFF_ROLES = ["admin", "superadmin"];

/**
 * Единственное определение «это персонал» на весь проект.
 *
 * Ключевая часть — проверка `collection === "admins"`. Роль сама по себе
 * НИЧЕГО не значит: коллекция покупателей `users` тоже имеет поле `role` с
 * теми же значениями admin/superadmin (историческое наследие старой БД, см.
 * User.ts), поэтому проверка вида `req.user.role === "superadmin"` без
 * коллекции выдаёт права персонала обычному покупателю, которому это поле
 * удалось выставить. Именно так и утекали чужие заказы: покупатель с
 * role=superadmin проходил гейт `read` в Orders/Carts/Sessions и получал всю
 * коллекцию целиком.
 *
 * Персонал живёт ТОЛЬКО в коллекции `admins` (см. payload.config.ts:
 * admin.user = Admins.slug). Это единственная граница, не зависящая от
 * содержимого пользовательских данных.
 */
export function isStaffUser(user: RequestUser): boolean {
	if (!user) return false;
	if (user.collection !== "admins") return false;
	return STAFF_ROLES.includes((user as { role?: string }).role ?? "");
}

/**
 * Доступ к документам, принадлежащим пользователю (поле `user`):
 * персонал видит все, покупатель — только свои, аноним — ничего.
 *
 * Возвращает Where-фильтр, а не true/false, поэтому одинаково корректно
 * работает и для списков (`find` подмешивает фильтр в запрос), и для
 * обращения по id (`findByID` проверяет документ против того же фильтра) —
 * т.е. закрывает и перебор идентификаторов (IDOR), и выгрузку коллекции.
 *
 * Использовать во ВСЕХ коллекциях с полем-владельцем `user`. Не дублировать
 * проверку роли на местах: любая копия — кандидат разойтись с этой.
 */
export const ownedByUserOrStaff: Access = ({ req }) => {
	if (!req.user) return false;
	if (isStaffUser(req.user)) return true;
	// Покупатель (или что-либо ещё, не являющееся персоналом) — только свои
	// документы, независимо от значения его поля role.
	if (req.user.collection !== "users") return false;
	return { user: { equals: req.user.id } };
};

/**
 * Поле может писать/менять только персонал. Для служебных полей, которыми
 * управляет система или администратор, а не сам владелец аккаунта
 * (role, status, флаги верификации и т.п.).
 *
 * ВАЖНО: указывать и `create`, и `update`. Одного `update` недостаточно —
 * при создании документа поле остаётся открытым, и его можно передать в теле
 * запроса (так аноним и выписывал себе role=superadmin через POST /api/users).
 */
export const staffOnlyField: FieldAccess = ({ req }) => isStaffUser(req.user);
