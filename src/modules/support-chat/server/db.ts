import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/**
 * Общие мелочи сырого SQL модуля.
 *
 * Как и *.db.ts в src/payload/services, модули этого слоя принимают Payload
 * аргументом и не тянут getPayload: их грузят шлюз и воркер (голый Node), тесты
 * и Next. Тогда один и тот же код работает везде, а транзакцию можно передать
 * сверху.
 */

/**
 * Фрагмент запроса. @payloadcms/db-postgres реэкспортирует `sql`, но не его
 * тип, а drizzle-orm прямой зависимостью проекта не является.
 */
export type SQL = ReturnType<typeof sql>;

export type Row = Record<string, unknown>;

/** То, у чего есть `execute(sql)`: drizzle или открытая им транзакция. */
export interface Executor {
	execute: (query: SQL) => Promise<unknown>;
}

interface TransactionalDrizzle extends Executor {
	transaction: <T>(fn: (tx: Executor) => Promise<T>) => Promise<T>;
}

export function drizzleOf(payload: Payload): TransactionalDrizzle {
	return payload.db.drizzle as unknown as TransactionalDrizzle;
}

export function withTransaction<T>(
	payload: Payload,
	fn: (tx: Executor) => Promise<T>,
): Promise<T> {
	return drizzleOf(payload).transaction(fn);
}

export async function query(db: Executor, statement: SQL): Promise<Row[]> {
	const result = (await db.execute(statement)) as { rows?: Row[] };
	return result.rows ?? [];
}

export async function queryOne(
	db: Executor,
	statement: SQL,
): Promise<Row | null> {
	return (await query(db, statement))[0] ?? null;
}

/**
 * numeric приходит из драйвера строкой (так Payload хранит поле number),
 * а null — null.
 */
export function num(value: unknown): number {
	return value === null || value === undefined ? 0 : Number(value);
}

export function numOrNull(value: unknown): number | null {
	return value === null || value === undefined ? null : Number(value);
}

export function iso(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return value instanceof Date
		? value.toISOString()
		: new Date(String(value)).toISOString();
}

export function str(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

/**
 * Массив id параметром `int[]`.
 *
 * drizzle разворачивает JS-массив в шаблоне в список параметров
 * (`($1, $2)`), а `ANY(…)` ждёт один параметр-массив. Литерал массива
 * строкой безопасен: в него попадают только целые числа, проверенные здесь.
 */
export function intArray(ids: readonly number[]): SQL {
	for (const id of ids) {
		if (!Number.isSafeInteger(id)) throw new TypeError(`Не целое число: ${id}`);
	}
	return sql`${`{${ids.join(",")}}`}::int[]`;
}

/** Нарушение уникального ограничения Postgres. */
export function isUniqueViolation(
	error: unknown,
	constraint?: string,
): boolean {
	const pgError = findPgError(error);
	if (pgError?.code !== "23505") return false;
	return constraint === undefined || pgError.constraint === constraint;
}

function findPgError(
	error: unknown,
): { code?: string; constraint?: string } | null {
	// drizzle оборачивает ошибку драйвера: исходная лежит в `cause`.
	let current: unknown = error;
	for (let depth = 0; current && depth < 5; depth++) {
		const candidate = current as {
			code?: string;
			constraint?: string;
			cause?: unknown;
		};
		if (typeof candidate.code === "string") return candidate;
		current = candidate.cause;
	}
	return null;
}
