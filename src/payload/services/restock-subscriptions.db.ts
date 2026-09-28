import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { renderNotification } from "../../services/notifications/notificationCenter.ts";

/**
 * Низкоуровневые операции над подписками «Сообщить о поступлении».
 *
 * Как и promo-redemptions.db.ts, модуль принимает готовый экземпляр Payload
 * аргументом и не тянет getPayload: его импортирует хук коллекции товаров, а
 * коллекции загружает CLI Payload в обычном Node без Next.js.
 *
 * Сырые SQL-запросы здесь не ради скорости, а ради атомарности: и подписка
 * (ON CONFLICT), и «закрыть подписки + создать уведомления» — это ровно по
 * одному запросу, внутри которого гонка невозможна.
 */

type DrizzleRows = { rows?: Record<string, unknown>[] };

function rows(result: unknown): Record<string, unknown>[] {
	return (result as DrizzleRows).rows ?? [];
}

/**
 * Подписывает пользователя на товар. Повторный вызов ничего не меняет —
 * уникальный индекс (user_id, product_id) превращает его в no-op.
 */
export async function insertRestockSubscription(
	payload: Payload,
	userId: number,
	productId: number,
): Promise<void> {
	await payload.db.drizzle.execute(sql`
		INSERT INTO restock_subscriptions (user_id, product_id)
		VALUES (${userId}, ${productId})
		ON CONFLICT (user_id, product_id) DO NOTHING
	`);
}

export async function deleteRestockSubscription(
	payload: Payload,
	userId: number,
	productId: number,
): Promise<void> {
	await payload.db.drizzle.execute(sql`
		DELETE FROM restock_subscriptions
		WHERE user_id = ${userId} AND product_id = ${productId}
	`);
}

/** id товаров, поступления которых ждёт пользователь. */
export async function listSubscribedProductIds(
	payload: Payload,
	userId: number,
): Promise<number[]> {
	const result = await payload.db.drizzle.execute(sql`
		SELECT product_id FROM restock_subscriptions WHERE user_id = ${userId}
	`);
	return rows(result).map((row) => Number(row.product_id));
}

export async function hasRestockSubscribers(
	payload: Payload,
	productId: number,
): Promise<boolean> {
	const result = await payload.db.drizzle.execute(sql`
		SELECT 1 FROM restock_subscriptions WHERE product_id = ${productId} LIMIT 1
	`);
	return rows(result).length > 0;
}

/** Товары, которых кто-то ждёт. Для страховочного обхода воркера. */
export async function listProductsWithSubscribers(
	payload: Payload,
): Promise<number[]> {
	const result = await payload.db.drizzle.execute(sql`
		SELECT DISTINCT product_id FROM restock_subscriptions
	`);
	return rows(result).map((row) => Number(row.product_id));
}

/**
 * Закрывает до `limit` подписок на товар и создаёт по внутрисайтовому
 * уведомлению на каждую — ОДНИМ запросом.
 *
 * Это и есть защита от дублей. Удаление и вставка — один оператор, поэтому
 * не бывает ни «уведомление создано, подписка осталась» (второе уведомление
 * при повторе задачи), ни «подписка удалена, уведомления нет». FOR UPDATE
 * SKIP LOCKED делает безопасным и параллельный запуск: две задачи по одному
 * товару разберут разные строки, а не одни и те же.
 *
 * Пачками, а не всё сразу: у популярного товара подписчиков могут быть
 * тысячи, и один запрос на всех держал бы блокировки и транзакцию дольше,
 * чем нужно.
 *
 * @returns сколько уведомлений создано. Меньше `limit` — подписок не осталось.
 */
export async function notifyRestockBatch(
	payload: Payload,
	input: {
		productId: number;
		productTitle: string;
		productUrl: string;
		limit: number;
	},
): Promise<number> {
	const data = {
		productId: input.productId,
		productTitle: input.productTitle,
		productUrl: input.productUrl,
	};
	const notification = renderNotification("product_back_in_stock", data);

	const result = await payload.db.drizzle.execute(sql`
		WITH claimed AS (
			DELETE FROM restock_subscriptions
			WHERE id IN (
				SELECT id FROM restock_subscriptions
				WHERE product_id = ${input.productId}
				ORDER BY id
				LIMIT ${input.limit}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING user_id
		)
		INSERT INTO notifications (user_id, type, title, body, link, data, is_read)
		SELECT
			user_id,
			${notification.type}::enum_notifications_type,
			${notification.title},
			${notification.body},
			${notification.link},
			${JSON.stringify(data)}::jsonb,
			false
		FROM claimed
		RETURNING id
	`);

	return rows(result).length;
}
