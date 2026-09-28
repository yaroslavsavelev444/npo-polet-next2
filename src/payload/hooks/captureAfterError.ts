// src/payload/hooks/captureAfterError.ts
import type { AfterErrorHook } from "payload";

/**
 * Ошибки REST, GraphQL и админки Payload — в журнал ошибок
 * (src/services/observability/README.md).
 *
 * Payload ловит исключения своих эндпоинтов сам и отвечает JSON-ом, поэтому
 * до onRequestError в instrumentation.ts они не доходят. Фиксируются только
 * 5xx: 4xx здесь — штатные отказы (403 без прав, 404, ошибка валидации
 * формы в админке), их тысячи, и реакции они не требуют.
 *
 * Модуль захвата подключается динамическим импортом: статический затащил бы
 * в граф payload.config сам getPayload (и тем самым цикл), а заодно Redis и
 * nodemailer — в контейнер миграций, которому они не нужны.
 */
export const captureAfterError: AfterErrorHook = async ({
	error,
	req,
	collection,
}) => {
	const status = (error as { status?: unknown }).status;
	if (typeof status === "number" && status < 500) return;

	try {
		const { captureError } = await import(
			"../../services/observability/capture.ts"
		);
		const { maskPath } = await import(
			"../../services/observability/safe-payload.ts"
		);

		const url = req.url ? new URL(req.url, "http://localhost") : null;
		const pathname = url?.pathname ?? req.pathname;
		const user = req.user as {
			id?: string | number;
			collection?: string;
		} | null;

		captureError(error, {
			source: "payload",
			module: collection ? `payload/${collection.slug}` : "payload",
			http: {
				method: req.method,
				route: pathname ? maskPath(pathname) : undefined,
				path: url ? `${url.pathname}${url.search}` : pathname,
				status: typeof status === "number" ? status : 500,
			},
			userId: user?.id ? `${user.collection ?? "?"}:${user.id}` : null,
			ip:
				req.headers?.get("x-real-ip")?.trim() ||
				req.headers?.get("x-forwarded-for")?.split(",").pop()?.trim() ||
				null,
			userAgent: req.headers?.get("user-agent") ?? null,
		});
	} catch {
		// Обработчик ошибок не имеет права быть источником ошибок.
	}
};
