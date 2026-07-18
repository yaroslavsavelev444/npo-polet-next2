import type { BasePayload } from "payload";
import type { EmailAddress } from "../types.ts";

/**
 * Адреса всего персонала для служебных уведомлений (новый заказ, новый
 * feedback и т.п.).
 *
 * ВАЖНО: сотрудники живут в коллекции `admins`, а НЕ в `users`. `users` —
 * это покупатели (role всегда 'user'), и isAdminOrSuperAdmin по всему проекту
 * требует именно `collection === 'admins'`. Раньше функция искала админов в
 * `users` по role in ['admin','superadmin'] — таких строк там нет, поэтому
 * возвращался пустой список, и notifyNewOrder молча пропускал письмо админам
 * (`if (admins.length === 0) return`). Из-за этого уведомления о новых
 * заказах не доходили до персонала.
 */
export async function getAdminEmailAddresses(
	payload: BasePayload,
): Promise<EmailAddress[]> {
	const result = await payload.find({
		collection: "admins",
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});

	return result.docs
		.filter((admin) => Boolean(admin.email))
		.map((admin) => ({ email: admin.email, name: admin.name }));
}
