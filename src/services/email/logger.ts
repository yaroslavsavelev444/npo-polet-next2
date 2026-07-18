type LogContext = Record<string, unknown>;

function buildPayload(level: string, message: string, context?: LogContext) {
	return {
		scope: "email",
		level,
		message,
		...context,
		timestamp: new Date().toISOString(),
	};
}

/**
 * Тонкая обёртка вместо прямого console.* — единая точка, откуда в будущем
 * можно переключиться на pino (уже транзитивная зависимость через Payload)
 * без изменений в остальном email-модуле.
 */
export const emailLogger = {
	info(message: string, context?: LogContext) {
		console.log("[Email]", buildPayload("info", message, context));
	},
	warn(message: string, context?: LogContext) {
		console.warn("[Email]", buildPayload("warn", message, context));
	},
	error(message: string, context?: LogContext) {
		console.error("[Email]", buildPayload("error", message, context));
	},
};
