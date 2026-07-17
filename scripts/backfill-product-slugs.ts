// scripts/backfill-product-slugs.ts
//
// Проставляет slug товарам, у которых его нет, — миграция каталога на ЧПУ.
//
// Зачем: хук generateSlug (src/payload/utils/generateSlug.ts) срабатывает
// только при сохранении документа через Payload, поэтому товары, залитые до
// появления поля (или напрямую в БД), остались с slug = NULL. Такой товар
// доступен лишь по legacy-URL /category/<cat>/products/<id> и НЕ попадает в
// sitemap (app/(frontend)/sitemap.ts намеренно пропускает бесслаговые товары,
// чтобы не отдавать поисковикам URL, который сам себя редиректит).
//
// Запуск:
//   pnpm slugs:backfill           — сухой прогон, только показывает план
//   pnpm slugs:backfill --apply   — записывает изменения
//
// Скрипт идемпотентен: товары с уже заполненным slug не трогаются, поэтому
// повторный запуск безопасен.

// dotenv/config + node --experimental-strip-types (а не tsx), как в
// scripts/db-migrate/run.ts: payload/bin/loadEnv тянет next/env, который под
// tsx падает на "Cannot destructure property 'loadEnvConfig'".
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { buildSlugBase } from "../src/payload/utils/generateSlug.ts";

const APPLY = process.argv.includes("--apply");

async function main() {
	const payload = await getPayload({ config });

	const { docs } = await payload.find({
		collection: "products",
		limit: 0,
		depth: 0,
		pagination: false,
		overrideAccess: true,
		// Именно draft: false. У коллекции включены versions.drafts, и с
		// draft: true Payload отдаёт документы из таблицы версий — там свой id
		// (у осиротевших версий он вообще null), а товары, у которых версий ещё
		// нет, в выдачу не попадают вовсе. Обновлять надо сами документы
		// коллекции, а их возвращает только draft: false (черновики в их числе —
		// статус на состав выдачи не влияет).
		draft: false,
	});

	const missing = docs.filter((doc) => !doc.slug);

	if (missing.length === 0) {
		console.log(`✅ Все товары уже имеют slug (всего: ${docs.length}).`);
		process.exit(0);
	}

	console.log(
		`Товаров всего: ${docs.length}; без slug: ${missing.length}${
			APPLY ? "" : " (сухой прогон, ничего не пишем)"
		}\n`,
	);

	let updated = 0;
	let failed = 0;

	for (const product of missing) {
		if (!APPLY) {
			// Предпросмотр приблизительный: занятость slug проверяет хук, и при
			// совпадении названий он добавит суффикс (-2, -3, ...).
			console.log(
				`  ${product.id}  ${product.title}\n      ~> ${buildSlugBase(product.title)}`,
			);
			continue;
		}

		try {
			// Пустой data — не опечатка. Сам slug здесь не собираем: beforeValidate
			// хук поля (generateSlug) видит пустое значение, генерирует slug из
			// названия и сам разруливает коллизии. Так правила генерации живут в
			// одном месте, и бэкофилл не разъезжается с тем, что получают товары,
			// заведённые через админку.
			const result = await payload.update({
				collection: "products",
				id: product.id,
				data: {},
				overrideAccess: true,
				// Без этого Payload сохранил бы правку как черновик, и у
				// опубликованного товара витрина осталась бы на старой версии — без
				// slug. Существующий статус документа при этом не меняется:
				// published остаётся published, draft остаётся draft.
				draft: false,
			});

			console.log(`  ${product.id}  ${product.title}\n      -> ${result.slug}`);
			updated += 1;
		} catch (error) {
			failed += 1;
			console.error(
				`  ❌ ${product.id} (${product.title}): ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	if (!APPLY) {
		console.log("\nСухой прогон. Для записи повторите с флагом --apply.");
		process.exit(0);
	}

	console.log(
		`\n✅ Обновлено: ${updated}${failed ? `, ошибок: ${failed}` : ""}`,
	);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error("❌ Бэкофилл упал:", error);
	process.exit(1);
});
