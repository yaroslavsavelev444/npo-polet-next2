import { sql } from "@payloadcms/db-postgres";
import {
	manufacturerKey,
	normalizeSpec,
} from "../../modules/productCatalog/lib/specNormalization.ts";

/**
 * Пересчёт служебных ключей каталога по уже сохранённым товарам:
 * specifications[].nameKey/valueKey/valueNum/unitKey и brand.manufacturerKey.
 *
 * При обычной работе ключи пишет хук товара (normalizeProductForCatalog).
 * Этот пересчёт нужен дважды:
 *   • миграцией — один раз для товаров, сохранённых до появления ключей;
 *   • скриптом `pnpm catalog:normalize` — после изменения правил
 *     нормализации (specNormalization.ts), чтобы старые ключи совпали с
 *     новыми без пересохранения каждого товара в админке.
 *
 * Пересчёт идемпотентен и затрагивает только основные таблицы: версии
 * (_products_v_*) выдачей не читаются, а при восстановлении версии ключи
 * пересчитает хук.
 */

type Executor = {
	execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};
type DrizzleRows = { rows?: Record<string, unknown>[] };

const BATCH = 500;

function nullable(value: string | number | null): ReturnType<typeof sql> {
	return value === null ? sql`NULL` : sql`${value}`;
}

export async function backfillCatalogKeys(
	db: Executor,
): Promise<{ specifications: number; products: number }> {
	const specRows =
		(
			(await db.execute(sql`
			SELECT id, name, value, unit FROM products_specifications
		`)) as DrizzleRows
		).rows ?? [];

	for (let i = 0; i < specRows.length; i += BATCH) {
		const values = specRows.slice(i, i + BATCH).map((row) => {
			const key = normalizeSpec({
				name: row.name as string | null,
				value: row.value as string | null,
				unit: row.unit as string | null,
			});
			return sql`(${String(row.id)}, ${nullable(key.nameKey)}::varchar, ${nullable(key.valueKey)}::varchar, ${nullable(key.valueNum)}::numeric, ${nullable(key.unitKey)}::varchar)`;
		});
		await db.execute(sql`
			UPDATE products_specifications s SET
				name_key = v.name_key,
				value_key = v.value_key,
				value_num = v.value_num,
				unit_key = v.unit_key
			FROM (VALUES ${sql.join(values, sql`, `)})
				AS v(id, name_key, value_key, value_num, unit_key)
			WHERE s.id = v.id
		`);
	}

	const productRows =
		(
			(await db.execute(sql`
			SELECT id, brand_manufacturer FROM products
		`)) as DrizzleRows
		).rows ?? [];

	for (let i = 0; i < productRows.length; i += BATCH) {
		const values = productRows
			.slice(i, i + BATCH)
			.map(
				(row) =>
					sql`(${Number(row.id)}::int, ${nullable(manufacturerKey(row.brand_manufacturer as string | null))}::varchar)`,
			);
		await db.execute(sql`
			UPDATE products p SET brand_manufacturer_key = v.key
			FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, key)
			WHERE p.id = v.id
		`);
	}

	return { specifications: specRows.length, products: productRows.length };
}

/** Денормализованный рейтинг всех товаров — из одобренных отзывов. */
export async function backfillProductRatings(db: Executor): Promise<void> {
	await db.execute(sql`
		UPDATE products p SET
			analytics_rating_average = agg.average,
			analytics_reviews_count = COALESCE(agg.count, 0)
		FROM products p2
		LEFT JOIN (
			SELECT product_id, ROUND(AVG(rating)::numeric, 2) AS average, COUNT(*) AS count
			FROM product_reviews
			WHERE status = 'approved'
			GROUP BY product_id
		) agg ON agg.product_id = p2.id
		WHERE p.id = p2.id
	`);
}
