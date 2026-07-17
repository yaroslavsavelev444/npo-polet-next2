// src/payload/services/feed.service.ts
//
// Сборка и кэширование YML-фида Яндекса.
//
// АРХИТЕКТУРА
//   • Данные читаются из Payload Local API постранично (батчами), а не одним
//     запросом на весь каталог — так выборка масштабируется на десятки тысяч
//     товаров без пиков памяти и длинных транзакций.
//   • Готовый XML кэшируется через unstable_cache — тот же механизм, что у
//     getCachedProducts/getCachedCategories. Кэш помечен тегами
//     products/categories/settings, а существующие хуки коллекций
//     (createRevalidateCacheHook) уже дёргают revalidateTag на эти теги при
//     любом изменении. Значит, фид пересобирается сразу после правки товара
//     или категории в админке, а TTL (FEED_CACHE_TTL_SECONDS) — лишь
//     страховочный «потолок» свежести. Отдельный cron/worker не нужен.
//   • В dev кэш отключён (как и в остальных сервисах проекта), чтобы правки
//     были видны сразу.

import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Category, Product } from "@/payload-types";
import { env } from "../../env";
import {
	FEED_BATCH_SIZE,
	FEED_CACHE_TTL_SECONDS,
} from "../../modules/feed/config";
import {
	renderFeedHead,
	renderFeedTail,
	renderOffer,
} from "../../modules/feed/lib/buildYandexFeed";
import { getPayloadInstance } from "./getPayload";

export interface GeneratedFeed {
	xml: string;
	/** Сколько offers реально попало в фид — для логов/диагностики. */
	offerCount: number;
	/** Сколько категорий вошло в <categories>. */
	categoryCount: number;
}

// Только продаваемые, видимые и опубликованные товары. Черновики (versions.drafts
// включён у коллекции) без явного _status утекли бы в фид — см. products.service.
const FEED_PRODUCTS_WHERE: Where = {
	and: [
		{ _status: { equals: "published" } },
		{ "inventory.isVisible": { equals: true } },
		{ "inventory.status": { in: ["available", "preorder"] } },
	],
};

async function fetchActiveCategories(): Promise<Category[]> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "categories",
		where: { isActive: { equals: true } },
		sort: "order",
		limit: 1000,
		depth: 0,
		overrideAccess: true,
	});
	return result.docs as unknown as Category[];
}

async function buildFeed(): Promise<GeneratedFeed> {
	const payload = await getPayloadInstance();

	const categories = await fetchActiveCategories();
	const activeCategoryIds = new Set(categories.map((c) => c.id));

	const chunks: string[] = [renderFeedHead(categories)];
	let offerCount = 0;

	// Постраничный обход товаров. depth:1 подтягивает category и images одним
	// уровнем; больше не нужно. Идём по возрастанию id — стабильный порядок и
	// корректная пагинация.
	let page = 1;
	// totalPages узнаём из первого ответа; на всякий случай ограничиваем цикл.
	for (;;) {
		const result = await payload.find({
			collection: "products",
			where: FEED_PRODUCTS_WHERE,
			sort: "id",
			limit: FEED_BATCH_SIZE,
			page,
			depth: 1,
			overrideAccess: true,
		});

		for (const doc of result.docs as unknown as Product[]) {
			const offer = renderOffer(doc, { activeCategoryIds });
			if (offer) {
				chunks.push(offer);
				offerCount++;
			}
		}

		if (!result.hasNextPage) break;
		page += 1;
	}

	chunks.push(renderFeedTail());

	return {
		xml: chunks.join(""),
		offerCount,
		categoryCount: categories.length,
	};
}

/**
 * Возвращает готовый (закэшированный) YML-фид. В проде — из unstable_cache с
 * тег-инвалидацией; в dev — всегда свежий.
 */
export function getCachedYandexFeed(): Promise<GeneratedFeed> {
	if (env.NODE_ENV === "development") {
		return buildFeed();
	}
	return unstable_cache(buildFeed, ["yandex-yml-feed"], {
		tags: ["products", "categories", "settings"],
		revalidate: FEED_CACHE_TTL_SECONDS,
	})();
}
