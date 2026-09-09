import type { BasePayload } from "payload";
import {
	STAFF_COLLECTION,
	STAFF_ROLES,
} from "../../../payload/access/isAdminOrSuperAdmin.ts";
import type { EmailAddress } from "../types.ts";

/**
 * Адреса персонала для служебных уведомлений (новый заказ, новое обращение,
 * feedback).
 *
 * Получатель обязан удовлетворять ОБОИМ условиям:
 *
 *  1. иметь доступ к админ-панели Payload — то есть жить в коллекции
 *     `admins`. Доступ к панели даёт именно коллекция (payload.config.ts:
 *     `admin.user = Admins.slug`), а не поле `role`: одноимённые роли
 *     `admin`/`superadmin` есть и в коллекции `users`, но покупатель с такой
 *     ролью в панель не войдёт и письма получать не должен;
 *  2. иметь роль из STAFF_ROLES (`admin` или `superadmin`).
 *
 * Второе условие раньше не проверялось вовсе: выбирались ВСЕ строки `admins`.
 * Пока ролей в коллекции ровно две, результат совпадал, но любая новая роль
 * (например «контент-менеджер») молча начала бы получать заказы. Теперь
 * список ролей — общая константа с isAdminOrSuperAdmin, и разъехаться они не
 * могут.
 *
 * Порядок ролей в запросе не задаётся: письмо получает КАЖДЫЙ подходящий
 * сотрудник, а не первый найденный, и отправляется оно каждому отдельным
 * сообщением (см. EmailService.send) — чтобы один нерабочий адрес не уносил
 * с собой рассылку остальным.
 */
export async function getAdminEmailAddresses(
	payload: BasePayload,
): Promise<EmailAddress[]> {
	const result = await payload.find({
		collection: STAFF_COLLECTION,
		where: { role: { in: [...STAFF_ROLES] } },
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});

	// Дедупликация по адресу: у одного человека может быть две учётки (личная
	// и сервисная) с одинаковой почтой — дважды одно письмо ему не нужно.
	const seen = new Set<string>();
	const recipients: EmailAddress[] = [];

	for (const admin of result.docs) {
		const email = admin.email?.trim();
		if (!email) continue;

		const key = email.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		recipients.push({ email, name: admin.name });
	}

	return recipients;
}
