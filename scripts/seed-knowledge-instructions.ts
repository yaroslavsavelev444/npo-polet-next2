/**
 * Руководства по эксплуатации изделий → статьи базы знаний.
 *
 *   pnpm seed:knowledge-instructions --dry-run          # что будет сделано, без записи
 *   pnpm seed:knowledge-instructions                    # раздел «Инструкции» (instrukcii)
 *   pnpm seed:knowledge-instructions --category=<slug>  # другой раздел (например, локально)
 *
 * Тексты — src/modules/knowledge/seed/instructions.ts, картинки —
 * content/knowledge-instructions/<папка статьи>/*.webp.
 *
 * ЧТО ДЕЛАЕТ
 *  1. Находит раздел базы знаний по slug. Раздела нет — останавливается:
 *     создавать раздел на боевом сайте молча скрипт права не имеет.
 *  2. Создаёт недостающие секции («Ручные сеткомёты», «Сеткомёты для дронов»).
 *  3. Загружает картинки в media (alt, тип «Другое»).
 *  4. Создаёт статьи ЧЕРНОВИКАМИ и связывает их блоком «Рекомендуем прочитать».
 *
 * ПОЧЕМУ ЧЕРНОВИКАМИ
 * Черновик не виден ни на сайте, ни в поиске, ни в sitemap. Статья выходит к
 * людям только кнопкой «Опубликовать» в админке — после того как её кто-то
 * прочитал глазами. Это руководство по эксплуатации пиротехнического
 * изделия: опечатка в характеристике или перепутанный цвет светодиода здесь
 * не косметика.
 *
 * ИДЕМПОТЕНТЕН, как seed-banners.ts: статья опознаётся по slug, картинка — по
 * имени файла, секция — по slug. Существующее НЕ ОБНОВЛЯЕТСЯ: созданная статья
 * принадлежит редактору, и повторный запуск не должен затирать его правки.
 * Чтобы засеять статью заново — удалить её в админке и запустить ещё раз.
 *
 * Товары, на которые ссылаются статьи, ищутся по slug среди опубликованных.
 * Не нашёлся — вместо ссылки остаётся текст, а в выводе предупреждение.
 */

// dotenv ПЕРЕД импортом конфига — см. scripts/seed-banners.ts.
import "dotenv/config";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getPayload, type Payload, type Where } from "payload";
import config from "../payload.config.ts";
import {
	SEED_INSTRUCTIONS,
	SEED_SECTIONS,
	type SeedArticle,
	type SeedResolve,
} from "../src/modules/knowledge/seed/instructions.ts";
import {
	doc,
	docLink,
	type Inline,
	image,
} from "../src/modules/knowledge/seed/lexical.ts";

const CONTENT_DIR = join(
	import.meta.dirname,
	"..",
	"content",
	"knowledge-instructions",
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CATEGORY_SLUG =
	args.find((arg) => arg.startsWith("--category="))?.split("=")[1] ??
	"instrukcii";

/** В пробном прогоне вместо настоящих id — заглушка: документ всё равно собирается целиком. */
const DRY_ID = -1;

const log = (line = "") => process.stdout.write(`${line}\n`);

function mediaFilename(article: SeedArticle, name: string): string {
	return `instr-${article.dir}-${name}.webp`;
}

/**
 * Прогон содержимого статьи вхолостую: какие картинки и товары она использует.
 * Заодно ловит опечатки до первой записи в базу — картинку без файла или без
 * описания в `images`.
 */
function collectRefs(article: SeedArticle) {
	const images = new Set<string>(["oblozhka"]);
	const products = new Set<string>();
	article.content({
		img: (name) => {
			images.add(name);
			return image(DRY_ID);
		},
		product: (slug, text) => {
			products.add(slug);
			return text;
		},
	});

	for (const name of images) {
		if (!article.images[name])
			throw new Error(
				`${article.slug}: у картинки «${name}» нет описания в images`,
			);
		const file = join(CONTENT_DIR, article.dir, `${name}.webp`);
		if (!existsSync(file))
			throw new Error(`${article.slug}: нет файла ${file}`);
	}
	for (const name of Object.keys(article.images)) {
		if (!images.has(name))
			throw new Error(
				`${article.slug}: картинка «${name}» описана, но в статье не используется`,
			);
	}
	return { images, products };
}

async function findOne<
	T extends
		| "knowledge-categories"
		| "knowledge-sections"
		| "knowledge-topics"
		| "media"
		| "products",
>(
	payload: Payload,
	collection: T,
	field: string,
	value: string,
	extra: Where = {},
) {
	const { docs } = await payload.find({
		collection,
		where: { [field]: { equals: value }, ...extra } as Where,
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return docs[0] as unknown as
		| ({ id: number } & Record<string, unknown>)
		| undefined;
}

async function ensureSections(payload: Payload, categoryId: number) {
	const ids = {} as Record<keyof typeof SEED_SECTIONS, number>;
	for (const [key, section] of Object.entries(SEED_SECTIONS) as [
		keyof typeof SEED_SECTIONS,
		(typeof SEED_SECTIONS)[keyof typeof SEED_SECTIONS],
	][]) {
		const existing = await findOne(
			payload,
			"knowledge-sections",
			"slug",
			section.slug,
		);
		if (existing) {
			const owner =
				typeof existing.category === "object"
					? (existing.category as { id: number }).id
					: existing.category;
			if (owner !== categoryId) {
				// slug секции уникален на весь сайт. Секция из чужого раздела —
				// не та секция: статья в ней пропала бы со страницы раздела.
				throw new Error(
					`секция ${section.slug} уже есть, но в другом разделе (id ${owner}) — разберитесь в админке`,
				);
			}
			log(`= секция «${section.title}» — уже есть`);
			ids[key] = existing.id;
			continue;
		}
		if (DRY_RUN) {
			log(`+ секция «${section.title}» (${section.slug}) — будет создана`);
			ids[key] = DRY_ID;
			continue;
		}
		const created = await payload.create({
			collection: "knowledge-sections",
			data: { ...section, category: categoryId, isActive: true },
			overrideAccess: true,
		});
		log(`+ секция «${section.title}» (${section.slug})`);
		ids[key] = created.id;
	}
	return ids;
}

async function resolveProducts(payload: Payload, slugs: Set<string>) {
	const found = new Map<string, number>();
	for (const slug of slugs) {
		const product = await findOne(payload, "products", "slug", slug, {
			_status: { equals: "published" },
		});
		if (product) found.set(slug, product.id);
		else
			log(
				`! товар ${slug} не найден среди опубликованных — в статье останется текстом без ссылки`,
			);
	}
	return found;
}

async function uploadImages(
	payload: Payload,
	article: SeedArticle,
	names: Set<string>,
) {
	const ids = new Map<string, number>();
	for (const name of names) {
		const filename = mediaFilename(article, name);
		const existing = await findOne(payload, "media", "filename", filename);
		if (existing) {
			ids.set(name, existing.id);
			continue;
		}
		if (DRY_RUN) {
			ids.set(name, DRY_ID);
			continue;
		}
		const path = join(CONTENT_DIR, article.dir, `${name}.webp`);
		const created = await payload.create({
			collection: "media",
			data: { alt: article.images[name], type: "other", isPublic: true },
			file: {
				data: readFileSync(path),
				mimetype: "image/webp",
				name: filename,
				size: statSync(path).size,
			},
			overrideAccess: true,
		});
		ids.set(name, created.id);
	}
	return ids;
}

async function main() {
	// Сначала — проверка всех статей без базы: опечатка в четвёртой статье не
	// должна обнаружиться после того, как три первые уже записаны.
	const refs = new Map(
		SEED_INSTRUCTIONS.map((article) => [article.slug, collectRefs(article)]),
	);
	const slugs = new Set(SEED_INSTRUCTIONS.map((article) => article.slug));
	for (const article of SEED_INSTRUCTIONS) {
		for (const related of article.related) {
			if (!slugs.has(related))
				throw new Error(
					`${article.slug}: в related неизвестная статья ${related}`,
				);
		}
	}

	const payload = await getPayload({ config });
	log(DRY_RUN ? "ПРОБНЫЙ ПРОГОН — в базу ничего не пишется.\n" : "");

	const category = await findOne(
		payload,
		"knowledge-categories",
		"slug",
		CATEGORY_SLUG,
	);
	if (!category) {
		throw new Error(
			`раздел базы знаний «${CATEGORY_SLUG}» не найден. Укажите существующий: --category=<slug>`,
		);
	}
	log(`Раздел: «${category.title}» (${CATEGORY_SLUG})`);

	const sectionIds = await ensureSections(payload, category.id);
	const productIds = await resolveProducts(
		payload,
		new Set([...refs.values()].flatMap((r) => [...r.products])),
	);

	const topicIds = new Map<string, number>();
	const created: SeedArticle[] = [];

	for (const article of SEED_INSTRUCTIONS) {
		const existing = await findOne(
			payload,
			"knowledge-topics",
			"slug",
			article.slug,
		);
		if (existing) {
			topicIds.set(article.slug, existing.id);
			log(`= ${article.slug} — уже есть (${existing._status}), не трогаем`);
			continue;
		}

		const { images } = refs.get(article.slug)!;
		const mediaIds = await uploadImages(payload, article, images);
		const resolve: SeedResolve = {
			img: (name) => image(mediaIds.get(name)!),
			product: (slug, text): Inline => {
				const id = productIds.get(slug);
				return id ? docLink("products", id, text) : text;
			},
		};

		const data = {
			title: article.title,
			description: article.description,
			content: doc(article.content(resolve)),
			category: category.id,
			section: sectionIds[article.section],
			image: mediaIds.get("oblozhka")!,
			tags: article.tags.map((tag) => ({ tag })),
			slug: article.slug,
			position: article.position,
			_status: "draft" as const,
		};

		if (DRY_RUN) {
			log(
				`+ ${article.slug} — будет создана черновиком: ${images.size} картинок, ${data.content.root.children.length} блоков`,
			);
			continue;
		}

		// В типах Payload content — строго типизированное дерево узлов, а
		// здесь узлы собраны сборщиками из seed/lexical.ts. Форму проверяет
		// сам Payload при записи (валидация richText), поэтому приведение
		// ничего не прячет.
		const topic = await payload.create({
			collection: "knowledge-topics",
			data: data as never,
			overrideAccess: true,
		});
		topicIds.set(article.slug, topic.id);
		created.push(article);
		log(`+ ${article.slug} — черновик, id ${topic.id}`);
	}

	// Рекомендации — вторым проходом: на момент создания первой статьи
	// остальных ещё нет. Только у статей, созданных сейчас, — существующие
	// принадлежат редактору.
	for (const article of created) {
		const related = article.related
			.map((slug) => topicIds.get(slug))
			.filter((id): id is number => typeof id === "number");
		if (related.length === 0) continue;
		await payload.update({
			collection: "knowledge-topics",
			id: topicIds.get(article.slug)!,
			data: { related, _status: "draft" },
			overrideAccess: true,
		});
	}

	if (DRY_RUN) {
		log("\nПробный прогон завершён. Для записи запустите без --dry-run.");
		return;
	}

	log(
		`\nСоздано статей: ${created.length}, пропущено: ${SEED_INSTRUCTIONS.length - created.length}.` +
			(created.length > 0
				? "\nСтатьи — черновики: проверьте их в админке (База знаний → Статьи) и опубликуйте."
				: ""),
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		process.stderr.write(
			`Не удалось засеять инструкции: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exit(1);
	});
