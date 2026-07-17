// scripts/regenerate-product-slug.ts
//
// Принудительно перегенерирует slug у конкретных товаров из их ТЕКУЩЕГО
// названия.
//
// Зачем: slug генерируется один раз (см. src/payload/utils/generateSlug.ts)
// и дальше не трогается сам по себе — это правильно для уже опубликованных
// товаров, но если исходная генерация была кривой (типичный случай — визуально
// похожие кириллические и латинские символы транслитерируются не в то, что
// ожидаешь: "30БН" превращается в "zobn"), поле остаётся неверным даже после
// того, как название в админке поправили.
//
// Старый slug при этом не теряется: hooks/trackPreviousSlug.ts сохраняет его
// в previousSlugs, и резолвер страницы товара
// (app/.../products/[slug]/page.tsx) находит товар по старому адресу и уводит
// 308-редиректом на новый — уже проиндексированная страница не превращается
// в 404.
//
// Запуск (id или ТЕКУЩИЙ slug товара, можно смешивать и указывать несколько):
//   pnpm slug:regenerate <id-или-slug> [<id-или-slug> ...]           — сухой прогон
//   pnpm slug:regenerate <id-или-slug> [<id-или-slug> ...] --apply   — записывает
//
// dotenv/config + node --experimental-strip-types (а не tsx), как в
// scripts/db-migrate/run.ts: payload/bin/loadEnv тянет next/env, который под
// tsx падает на "Cannot destructure property 'loadEnvConfig'".
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { buildSlugBase } from "../src/payload/utils/generateSlug.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const targets = args.filter((arg) => arg !== "--apply");

if (targets.length === 0) {
	console.error(
		"Укажите id или текущий slug товара(ов):\n" +
			"  pnpm slug:regenerate <id-или-slug> [<id-или-slug> ...] [--apply]",
	);
	process.exit(1);
}

async function main() {
	const payload = await getPayload({ config });

	let touched = 0;
	let notFoundCount = 0;
	let failed = 0;

	for (const target of targets) {
		const isId = /^\d+$/.test(target);

		const { docs } = await payload.find({
			collection: "products",
			where: isId ? { id: { equals: target } } : { slug: { equals: target } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
			draft: false,
		});

		const product = docs[0];
		if (!product) {
			notFoundCount += 1;
			console.log(`  ❌ не найден товар по ${isId ? "id" : "slug"}: ${target}`);
			continue;
		}

		console.log(
			`  ${product.id}  "${product.title}"\n      текущий slug: ${product.slug}`,
		);

		if (!APPLY) {
			// Предпросмотр приблизительный: занятость нового slug (суффикс -2, -3...)
			// проверяет сам хук в момент реальной записи.
			console.log(`      ~> ${buildSlugBase(product.title)}`);
			continue;
		}

		try {
			// Пустой slug — не опечатка. beforeValidate-хук поля (generateSlug)
			// видит пустое значение и генерирует новый slug из ТЕКУЩЕГО названия;
			// collection-хук (trackPreviousSlug) в этот же беспроходной проход
			// переносит старый slug в previousSlugs, откуда его подхватит резолвер
			// страницы товара для 308-редиректа.
			const updated = await payload.update({
				collection: "products",
				id: product.id,
				data: { slug: "" },
				overrideAccess: true,
				// Без этого Payload сохранил бы правку как черновик, и у
				// опубликованного товара витрина осталась бы на старой версии.
				// Существующий статус документа при этом не меняется.
				draft: false,
			});

			console.log(`      -> ${updated.slug}`);
			touched += 1;
		} catch (error) {
			failed += 1;
			console.error(
				`      ❌ ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (!APPLY) {
		console.log("\nСухой прогон. Для записи повторите с флагом --apply.");
		process.exit(notFoundCount > 0 ? 1 : 0);
	}

	console.log(
		`\n✅ Перегенерировано: ${touched}` +
			`${notFoundCount ? `, не найдено: ${notFoundCount}` : ""}` +
			`${failed ? `, ошибок: ${failed}` : ""}`,
	);
	process.exit(failed > 0 || notFoundCount > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error("❌ Скрипт упал:", error);
	process.exit(1);
});
