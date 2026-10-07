import { createHash } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { PRODUCT_VIEW_WINDOW_MS } from "@/modules/analytics/lib/product-views";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { redis } from "@/modules/auth/lib/redis";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { incrementProductViews } from "@/payload/services/product-counters.db";
import { captureError } from "@/services/observability/capture";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Краулеры и сервисы предпросмотра: их «просмотры» — не интерес покупателя. */
const BOT_UA =
	/bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pagespeed/i;

/**
 * POST /api/catalog/products/:id/view
 *
 * +1 к products.analytics.viewsCount. Вызывается из браузера (sendBeacon)
 * после того, как карточка товара реально открылась, — не из рендера
 * страницы: Server Component рендерится и для краулеров, и для prefetch, и
 * повторно при router.refresh(), и запись там считала бы всё это просмотрами.
 *
 * Дедупликация двухслойная. Клиент не шлёт повтор в течение окна сам (это
 * экономит запросы), но клиенту верить нельзя — поэтому окно повторено здесь:
 * SET NX в Redis по паре «товар × (IP + User-Agent)». Ключ атомарен, так что
 * два одновременных запроса одного посетителя дадут один инкремент, и
 * работает одинаково при нескольких экземплярах приложения.
 *
 * Ответ всегда 204 и ничего не сообщает: посетителю нечего с ним делать, а
 * подбирающему накрутку незачем знать, засчитан ли запрос. Сама запись — в
 * after(), уже после ответа.
 */
export async function POST(
	req: NextRequest,
	ctx: RouteContext<"/api/catalog/products/[id]/view">,
): Promise<Response> {
	const { id } = await ctx.params;
	const productId = /^\d{1,10}$/.test(id) ? Number(id) : null;

	// Чужой сайт не должен накручивать просмотры руками посетителя. Браузер
	// ставит Sec-Fetch-Site сам, подделать его со страницы нельзя.
	const fetchSite = req.headers.get("sec-fetch-site");
	const sameOrigin = !fetchSite || fetchSite === "same-origin";

	const { ip, userAgent } = await getRequestMeta();

	if (productId && sameOrigin && userAgent && !BOT_UA.test(userAgent)) {
		after(() => recordView(productId, ip, userAgent));
	}

	return new Response(null, { status: 204 });
}

async function recordView(
	productId: number,
	ip: string,
	userAgent: string,
): Promise<void> {
	try {
		const visitor = createHash("sha256")
			.update(`${ip}\n${userAgent}`)
			.digest("base64url")
			.slice(0, 22);

		const fresh = await redis
			.set(
				`pv:${productId}:${visitor}`,
				"1",
				"PX",
				PRODUCT_VIEW_WINDOW_MS,
				"NX",
			)
			.catch(() => "OK"); // Redis лежит — считаем: клиентское окно всё ещё действует
		if (fresh !== "OK") return;

		const limit = await RATE_LIMITS.productView(ip);
		if (!limit.allowed) return;

		const payload = await getPayloadInstance();
		await incrementProductViews(payload, productId);
	} catch (error) {
		captureError(error, {
			source: "http",
			module: "api/catalog/products/view",
			http: {
				method: "POST",
				route: "/api/catalog/products/[id]/view",
				status: 500,
			},
		});
	}
}
