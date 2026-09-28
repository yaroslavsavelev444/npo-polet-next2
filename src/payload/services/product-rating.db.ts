import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";

/**
 * Денормализованный рейтинг товара: products.analytics.ratingAverage и
 * analytics.reviewsCount.
 *
 * Зачем хранить: каталог сортирует по рейтингу ДО пагинации, а агрегат,
 * посчитанный по отзывам уже после выборки страницы, упорядочить выдачу не
 * может. Поле обновляется двумя путями, и оба считают его одинаково — из
 * одобренных отзывов:
 *
 *   • хук отзывов (Reviews.ts) — после любого изменения, влияющего на
 *     агрегат: создание, смена статуса или оценки, перенос, удаление;
 *   • хук товара (normalizeProductForCatalog) — при каждом сохранении товара.
 *     Иначе админка, открытая до одобрения отзыва, при сохранении записала бы
 *     поверх свежего значения то, что было в форме.
 *
 * Модуль не импортирует getPayload — его подключают хуки коллекций, а их
 * грузит CLI Payload в обычном Node (см. promo-redemptions.db.ts).
 */

type DrizzleRows = { rows?: Record<string, unknown>[] };
type Executor = {
	execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

export interface StoredRating {
	ratingAverage: number | null;
	reviewsCount: number;
}

/**
 * Соединение текущей транзакции запроса. Хуки afterChange выполняются ДО
 * коммита: запрос через общий пул не увидел бы только что одобренный отзыв и
 * посчитал бы агрегат без него.
 */
async function getExecutor(
	payload: Payload,
	req?: Partial<PayloadRequest>,
): Promise<Executor> {
	const db = payload.db as unknown as {
		drizzle: Executor;
		sessions?: Record<string | number, { db: Executor } | undefined>;
	};
	const transactionID = req?.transactionID ? await req.transactionID : null;
	return (transactionID && db.sessions?.[transactionID]?.db) || db.drizzle;
}

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/** Агрегат по одобренным отзывам товара. */
export async function readProductRating(
	payload: Payload,
	productId: number,
	req?: Partial<PayloadRequest>,
): Promise<StoredRating> {
	const db = await getExecutor(payload, req);
	const result = (await db.execute(sql`
		SELECT ROUND(AVG(rating)::numeric, 2)::float AS average, COUNT(*)::int AS count
		FROM product_reviews
		WHERE product_id = ${productId} AND status = 'approved'
	`)) as DrizzleRows;
	const row = result.rows?.[0] ?? {};
	const count = toNumber(row.count);
	return {
		ratingAverage: count > 0 ? toNumber(row.average) : null,
		reviewsCount: count,
	};
}

/**
 * Пересчитывает и записывает агрегат одним UPDATE — без payload.update: тот
 * создал бы новую версию товара и заново прогнал все его хуки ради двух
 * служебных чисел.
 */
export async function syncProductRating(
	payload: Payload,
	productIds: (number | string | null | undefined)[],
	req?: Partial<PayloadRequest>,
): Promise<void> {
	const ids = [...new Set(productIds.map(Number))].filter(
		(id) => Number.isInteger(id) && id > 0,
	);
	if (ids.length === 0) return;

	const db = await getExecutor(payload, req);
	for (const id of ids) {
		await db.execute(sql`
			UPDATE products p SET
				analytics_rating_average = agg.average,
				analytics_reviews_count = agg.count
			FROM (
				SELECT
					CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(rating)::numeric, 2) END AS average,
					COUNT(*) AS count
				FROM product_reviews
				WHERE product_id = ${id} AND status = 'approved'
			) agg
			WHERE p.id = ${id}
		`);
	}
}
