import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";

/**
 * Счётчики популярности товара: products.analytics.viewsCount и
 * analytics.purchasesCount. По ним сортируют каталог (catalog-facets.service)
 * и ранжирует поиск (search.service).
 *
 * ─── Почему прямой UPDATE, а не payload.update ─────────────────────────────
 *
 * payload.update товара — это новая версия в _products_v, полный прогон хуков
 * и, главное, afterChange → revalidateTag("products"): каждый просмотр
 * сбрасывал бы весь кэш каталога. Здесь — один UPDATE одной колонки, хуки не
 * запускаются, кэш не трогается (сортировка подхватывает новые значения по
 * таймеру, см. getCatalogData).
 *
 * ─── Почему инкремент в SQL, а не «прочитать → прибавить → записать» ───────
 *
 * `SET x = COALESCE(x, 0) + 1` выполняется под блокировкой строки, поэтому
 * одновременные просмотры одного товара не теряют друг друга: второй UPDATE
 * дождётся первого и прибавит к уже увеличенному значению.
 *
 * ─── Почему пишет и админка, и не затирает ли она счётчик ──────────────────
 *
 * Админка держит в форме значение, прочитанное при открытии товара, и при
 * сохранении записала бы его поверх накопленного. Поэтому
 * normalizeProductForCatalog при каждом сохранении перечитывает счётчики из
 * базы (readProductCounters) — так же, как рейтинг.
 *
 * Модуль не импортирует getPayload — его подключают хуки коллекций, а их
 * грузит CLI Payload в обычном Node (см. product-rating.db.ts).
 */

type DrizzleRows = { rows?: Record<string, unknown>[] };
type Executor = {
	execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

function getDrizzle(payload: Payload): Executor {
	return (payload.db as unknown as { drizzle: Executor }).drizzle;
}

/** Соединение текущей транзакции запроса (см. product-rating.db.ts). */
async function getExecutor(
	payload: Payload,
	req?: Partial<PayloadRequest>,
): Promise<Executor> {
	const db = payload.db as unknown as {
		sessions?: Record<string | number, { db: Executor } | undefined>;
	};
	const transactionID = req?.transactionID ? await req.transactionID : null;
	return (
		(transactionID && db.sessions?.[transactionID]?.db) || getDrizzle(payload)
	);
}

function toCount(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function toProductIds(ids: (number | string | null | undefined)[]): number[] {
	return [...new Set(ids.map(Number))].filter(
		(id) => Number.isInteger(id) && id > 0,
	);
}

export interface StoredCounters {
	viewsCount: number;
	purchasesCount: number;
}

/** Текущие значения счётчиков — для хука сохранения товара. */
export async function readProductCounters(
	payload: Payload,
	productId: number,
	req?: Partial<PayloadRequest>,
): Promise<StoredCounters | null> {
	const db = await getExecutor(payload, req);
	const result = (await db.execute(sql`
		SELECT analytics_views_count AS views, analytics_purchases_count AS purchases
		FROM products
		WHERE id = ${productId}
	`)) as DrizzleRows;
	const row = result.rows?.[0];
	if (!row) return null;
	return {
		viewsCount: toCount(row.views),
		purchasesCount: toCount(row.purchases),
	};
}

/**
 * +1 просмотр. Только опубликованному товару: черновик по ссылке видит лишь
 * администратор в превью, и его просмотры к популярности не относятся.
 *
 * Возвращает, нашлась ли строка.
 */
export async function incrementProductViews(
	payload: Payload,
	productId: number,
): Promise<boolean> {
	const result = (await getDrizzle(payload).execute(sql`
		UPDATE products
		SET analytics_views_count = COALESCE(analytics_views_count, 0) + 1
		WHERE id = ${productId} AND _status = 'published'
		RETURNING id
	`)) as DrizzleRows;
	return (result.rows?.length ?? 0) > 0;
}

/**
 * Сдвигает счётчик покупок у товаров одного заказа на ±1.
 *
 * Единица — заказ, а не штуки: оптовый заказ на 500 позиций одного товара —
 * это одна покупка, иначе он один перевешивал бы в сортировке «популярные»
 * десятки розничных. Повтор товара в позициях заказа тоже считается один раз.
 *
 * Пишет через общий пул и по одной строке на запрос, а не в транзакции
 * заказа одним UPDATE: там строки товаров оставались бы заблокированными до
 * коммита, и два одновременных заказа с общими товарами могли бы взять
 * блокировки в разном порядке — взаимоблокировка. Однострочный UPDATE в
 * автокоммите держит одну блокировку и сразу её отпускает. Цена — при откате
 * заказа уже после хука счётчик останется сдвинутым на единицу; для
 * сортировки это несущественно.
 */
export async function shiftProductPurchases(
	payload: Payload,
	productIds: (number | string | null | undefined)[],
	delta: 1 | -1,
): Promise<void> {
	const db = getDrizzle(payload);
	for (const id of toProductIds(productIds)) {
		await db.execute(sql`
			UPDATE products
			SET analytics_purchases_count =
				GREATEST(COALESCE(analytics_purchases_count, 0) + ${delta}, 0)
			WHERE id = ${id}
		`);
	}
}
