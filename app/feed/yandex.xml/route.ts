// app/feed/yandex.xml/route.ts
//
// Публичный YML-фид для Яндекс Директа / Яндекс Товаров.
//   GET /feed/yandex.xml  →  application/xml (YML)
//
// Тяжёлую работу (выборка + сборка XML) и кэширование инкапсулирует
// getCachedYandexFeed (feed.service.ts). Здесь только HTTP-обвязка.

import { getCachedYandexFeed } from "@/payload/services/feed.service";

// Payload Local API требует Node.js runtime. dynamic: сам ответ не кэшируется
// на уровне маршрута — за кэш отвечает unstable_cache внутри сервиса, что даёт
// точечную инвалидацию по тегам при изменении товаров/категорий.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
	try {
		const { xml } = await getCachedYandexFeed();

		return new Response(xml, {
			status: 200,
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				// Роботу Яндекса и промежуточным кэшам: фид можно подержать час,
				// но разрешаем отдавать устаревшую копию, пока считается свежая.
				"Cache-Control":
					"public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
			},
		});
	} catch (error) {
		// Текст ошибки — только в лог сервера. Наружу он уходить не должен:
		// сюда долетают в том числе ошибки Postgres/Payload с именами таблиц,
		// параметрами подключения и фрагментами запросов, а фид публичен и
		// индексируется. Клиенту достаточно кода 500.
		console.error("[feed/yandex.xml] generation failed:", error);
		return new Response(
			`<?xml version="1.0" encoding="UTF-8"?>\n<!-- feed generation error -->`,
			{
				status: 500,
				headers: { "Content-Type": "application/xml; charset=utf-8" },
			},
		);
	}
}
