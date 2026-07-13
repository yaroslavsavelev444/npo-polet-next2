// scripts/db-migrate/core/hash.ts

// Стабильная сериализация с сортировкой ключей объектов — нужна, чтобы
// сравнение "изменилась ли запись" не зависело от порядка ключей (порядок
// в JS-объекте, который мы строим в migration-модуле, и порядок ключей в
// документе, который отдаёт Payload, не гарантированно совпадают).
export function stableStringify(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (value instanceof Date) return JSON.stringify(value.toISOString());
	if (Array.isArray(value)) {
		return `[${value.map((v) => stableStringify(v)).join(",")}]`;
	}
	const keys = Object.keys(value as Record<string, unknown>).sort();
	const entries = keys.map(
		(k) =>
			`${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
	);
	return `{${entries.join(",")}}`;
}

// Сравнивает только те поля existingDoc, для которых в desiredData есть
// значение — так апдейт не пытается "исправить" поля, которыми управляет
// не миграция (например админ вручную дополнил товар полями, которых нет
// в старой системе).
export function hasChanges(
	existingDoc: Record<string, unknown>,
	desiredData: Record<string, unknown>,
): boolean {
	for (const key of Object.keys(desiredData)) {
		if (
			stableStringify(existingDoc[key]) !== stableStringify(desiredData[key])
		) {
			return true;
		}
	}
	return false;
}
