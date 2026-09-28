// scripts/normalize-catalog-keys.ts
//
// Пересчитывает служебные ключи каталога у всех товаров: нормализованные
// ключи характеристик (фасеты) и ключ производителя.
//
// Зачем: при сохранении товара ключи пишет хук normalizeProductForCatalog, а
// миграция 20260927_180000_catalog_facets заполнила их один раз. Если правила
// нормализации поменялись (src/modules/productCatalog/lib/specNormalization.ts
// — новая единица, новое написание), старые ключи с новыми не совпадут:
// фасет разъедется на «до» и «после». Этот скрипт приводит их к текущим
// правилам без пересохранения каждого товара в админке.
//
// Запуск: pnpm catalog:normalize
//
// Идемпотентен. Сбросить кэш каталога отсюда нельзя (revalidateTag работает
// только внутри запроса Next), а Data Cache переживает перезапуск — поэтому
// после прогона сохраните любой товар в админке: его хук сбросит тег
// «products», и фасеты пересоберутся по новым ключам.

// dotenv/config + node --experimental-strip-types (а не tsx) — см.
// scripts/backfill-product-slugs.ts.
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { backfillCatalogKeys } from "../src/payload/services/catalog-keys.db.ts";

async function main() {
	const payload = await getPayload({ config });
	const result = await backfillCatalogKeys(payload.db.drizzle);
	console.log(
		`Готово: строк характеристик — ${result.specifications}, товаров — ${result.products}.`,
	);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
