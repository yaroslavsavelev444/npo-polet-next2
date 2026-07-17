// scripts/db-migrate/core/errors.ts

/**
 * Извлекает пути полей, нарушивших unique-ограничение Postgres, из ошибки
 * Payload (ValidationError — см. @payloadcms/drizzle/dist/upsertRow/
 * handleUpsertError.js). Формат такой ошибки не содержит "duplicate"/"unique"
 * в message, только структурированный data.errors — поэтому такую проверку
 * нельзя делать через err.message.
 *
 * Дублирует src/modules/auth/lib/errorHandling.ts::extractPayloadErrorFieldPaths
 * — намеренно, а не через импорт. scripts/db-migrate запускается напрямую
 * через `node --experimental-strip-types` и не резолвит алиас `@/` (это
 * делает только сборщик Next.js на этапе применения путей из tsconfig) —
 * а тянуть модуль auth через длинный относительный путь ради восьми строк
 * означало бы, что независимый CLI-инструмент миграции зависит от
 * доменного auth-кода (который к тому же тащит за собой OtpStore и другие
 * не относящиеся к делу импорты).
 */
export function extractUniqueConstraintFieldPaths(err: unknown): string[] {
	const data = (err as { data?: { errors?: unknown } } | null | undefined)
		?.data;
	const errors = data?.errors;
	if (!Array.isArray(errors)) return [];
	return errors
		.map((e) => (e && typeof e === "object" && "path" in e ? e.path : null))
		.filter((p): p is string => typeof p === "string");
}
