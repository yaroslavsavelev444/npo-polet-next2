import type { Instrumentation } from "next";

// Сбор серверных ошибок веб-приложения (src/services/observability/README.md).
//
// Импорты модуля — только динамические и только в Node-рантайме: файл
// выполняется и в edge, а статический импорт затащил бы туда Payload, pg,
// ioredis и nodemailer.

export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;

	const { installWebProcessCapture } = await import(
		"./src/services/observability/process.ts"
	);
	installWebProcessCapture();

	// Письма об ошибках отправляет только веб-приложение: у воркеров нет
	// выхода к SMTP (см. src/services/observability/queue.ts).
	const { startAlertWorker } = await import(
		"./src/services/observability/alert-worker.ts"
	);
	startAlertWorker();
}

/**
 * Не ошибки, а управляющие исключения Next: `notFound()`, `redirect()`,
 * отказ от статической генерации. Штатное поведение, а не сбой.
 */
function isControlFlow(error: unknown): boolean {
	const digest =
		typeof error === "object" && error !== null && "digest" in error
			? String((error as { digest?: unknown }).digest)
			: "";
	return (
		digest.startsWith("NEXT_") ||
		digest === "DYNAMIC_SERVER_USAGE" ||
		digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING"
	);
}

function header(
	headers: Record<string, string | string[] | undefined>,
	name: string,
): string | undefined {
	const value = headers[name];
	return Array.isArray(value) ? value[0] : value;
}

const SOURCE_BY_ROUTE_TYPE = {
	render: "render",
	route: "http",
	action: "action",
	proxy: "http",
} as const;

/**
 * Всё, что Next поймал сам: падение рендера серверного компонента, исключение
 * в Route Handler или Server Action, отказ в proxy. То, что маршрут поймал и
 * превратил в ответ 500 сам, сюда не доходит — такие места фиксируют ошибку
 * явно, рядом со своим `console.error`.
 */
export const onRequestError: Instrumentation.onRequestError = async (
	error,
	request,
	context,
) => {
	if (process.env.NEXT_RUNTIME !== "nodejs" || isControlFlow(error)) return;

	try {
		const { captureError } = await import(
			"./src/services/observability/capture.ts"
		);

		captureError(error, {
			source: SOURCE_BY_ROUTE_TYPE[context.routeType] ?? "render",
			module: `next/${context.routeType}`,
			http: {
				method: request.method,
				// `routePath` — уже шаблон (`/app/(frontend)/orders/[orderNumber]`),
				// его можно в письмо. `request.path` несёт значения и query и
				// остаётся только в журнале.
				route: context.routePath,
				path: request.path,
				status: 500,
			},
			// Та же конвенция, что в modules/auth/lib/utils.ts: X-Real-IP от nginx,
			// иначе правый элемент X-Forwarded-For, но не левый — его задаёт клиент.
			ip:
				header(request.headers, "x-real-ip")?.trim() ||
				header(request.headers, "x-forwarded-for")?.split(",").pop()?.trim(),
			userAgent: header(request.headers, "user-agent"),
			extra: {
				routerKind: context.routerKind,
				routeType: context.routeType,
				renderSource: context.renderSource,
				revalidateReason: context.revalidateReason,
			},
		});
	} catch {
		// Обработчик ошибок не имеет права быть источником ошибок.
	}
};
