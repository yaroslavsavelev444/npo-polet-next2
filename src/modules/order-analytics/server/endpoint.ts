import type { Endpoint } from "payload";
import { canViewOrderAnalytics } from "../lib/access.ts";
import { AnalyticsQueryError, parseAnalyticsQuery } from "../lib/query.ts";
import { buildAnalyticsSection } from "./index.ts";

const NO_STORE = {
	"Cache-Control": "private, no-store",
	"X-Robots-Tag": "noindex, nofollow",
};

/**
 * GET /api/orders/analytics?section=overview&period=30d… — данные страницы
 * аналитики. Эндпоинт Payload, а не отдельный Route Handler: вход и CSRF те же,
 * что у остального API админки, ошибки 5xx идут в журнал ошибок (afterError).
 *
 * Право проверяется здесь, а не на странице: кнопку и страницу можно обойти
 * прямым запросом, а данные — нет.
 */
export const orderAnalyticsEndpoint: Endpoint = {
	path: "/analytics",
	method: "get",
	handler: async (req) => {
		if (!canViewOrderAnalytics(req.user)) {
			return Response.json(
				{ errors: [{ message: "Недостаточно прав" }] },
				{ status: req.user ? 403 : 401, headers: NO_STORE },
			);
		}

		let input: ReturnType<typeof parseAnalyticsQuery>;
		try {
			input = parseAnalyticsQuery(
				new URL(req.url ?? "", "http://internal").searchParams,
			);
		} catch (error) {
			if (error instanceof AnalyticsQueryError) {
				return Response.json(
					{ errors: [{ message: error.message }] },
					{ status: 400, headers: NO_STORE },
				);
			}
			throw error;
		}

		const data = await buildAnalyticsSection(req.payload, input);
		return Response.json(data, { headers: NO_STORE });
	},
};
