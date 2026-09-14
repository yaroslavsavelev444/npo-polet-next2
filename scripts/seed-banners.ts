/**
 * Стартовые сценарии модальных баннеров.
 *
 *   node --experimental-strip-types scripts/seed-banners.ts
 *
 * ИДЕМПОТЕНТЕН, и идемпотентен тем же способом, что `seed-faq.ts`: баннер
 * опознаётся по `seedKey`. Но, в отличие от FAQ, существующий баннер НЕ
 * ОБНОВЛЯЕТСЯ. Разница осознанная: тексты FAQ — справочник, который правится
 * из кода, а баннер с момента создания принадлежит редактору. Повторный запуск
 * не должен ни затирать его правку, ни воскрешать баннер, который редактор
 * осознанно снял с показа.
 *
 * Баннеры создаются со статусом «На публикацию», а не «Черновик»: хуки
 * коллекции выполняются и здесь, поэтому пятнадцатиминутное окно проверки
 * действует и на засеянные. Исключение «для своих» сделало бы правило
 * необязательным, а первый же сид на боевой базе показал бы людям текст,
 * который никто не перечитывал.
 */

// dotenv ПЕРЕД импортом конфига: src/env.ts валидирует переменные окружения на
// этапе загрузки модуля, а payload.config.ts тянет его за собой. Без этой
// строки скрипт падает на отсутствующих PAYLOAD_SECRET и DATABASE_URI ещё до
// первой строки main() — та же грабля, что описана в scripts/payload-cli.mts.
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { SEED_BANNERS } from "../src/modules/banners/server/seed.ts";
import { BANNER_PUBLISH_DELAY_MINUTES } from "../src/modules/banners/vocabulary.ts";

async function main() {
	const payload = await getPayload({ config });

	let created = 0;
	let skipped = 0;

	for (const banner of SEED_BANNERS) {
		const { seedKey, rationale, ...fields } = banner;

		const existing = await payload.find({
			collection: "banners",
			where: { seedKey: { equals: seedKey } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});

		if (existing.docs[0]) {
			process.stdout.write(`= ${seedKey} — уже есть, не трогаем\n`);
			skipped++;
			continue;
		}

		await payload.create({
			collection: "banners",
			data: {
				...fields,
				seedKey,
				isSystem: true,
				// Отсчёт окна проверки начинает хук коллекции; здесь задаётся
				// только намерение показывать.
				status: "scheduled",
			},
			overrideAccess: true,
		});

		created++;
		process.stdout.write(`+ ${seedKey}\n  ${rationale}\n\n`);
	}

	process.stdout.write(
		`Создано: ${created}, пропущено: ${skipped}.\n` +
			(created > 0
				? `Новые баннеры станут видны покупателям через ${BANNER_PUBLISH_DELAY_MINUTES} минут — ` +
					"это время на проверку текстов и ссылок в админке.\n"
				: ""),
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		process.stderr.write(`Не удалось засеять баннеры: ${String(error)}\n`);
		process.exit(1);
	});
