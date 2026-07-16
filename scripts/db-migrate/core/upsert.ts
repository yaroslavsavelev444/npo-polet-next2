// scripts/db-migrate/core/upsert.ts
import { hasChanges } from "./hash.ts";
import type { MigrationContext } from "./types.ts";

export type UpsertAction = "created" | "updated" | "unchanged" | "failed";

export interface UpsertResult {
	action: UpsertAction;
	id?: string | number;
	error?: unknown;
}

/**
 * Идемпотентный upsert по legacyId — сердце всей системы миграции.
 *
 * - Ничего не найдено по legacyId -> create.
 * - Найдено, но значения полей из `data` совпадают с тем, что уже в БД ->
 *   unchanged (ничего не пишем — важно для больших коллекций и для того,
 *   чтобы afterChange-хуки вроде revalidateTag/notify* не срабатывали
 *   впустую при каждом повторном прогоне).
 * - Найдено и данные отличаются -> update только изменившихся сверху
 *   переданных полей.
 *
 * Ошибка на одной записи НЕ прерывает весь прогон — ловится здесь,
 * логируется вызывающей стороной через action: 'failed', обработка
 * остальных записей коллекции продолжается.
 */
export async function upsertByLegacyId(params: {
	ctx: MigrationContext;
	collection: string;
	legacyId: string;
	data: Record<string, unknown>;
	/** Доп. where для поиска существующей записи, если legacyId недостаточно (напр. Cart/Wishlist ищут ещё и по user) */
	extraWhere?: Record<string, unknown>;
	/**
	 * Прокидывается в req.context хуков create/update — используется, чтобы
	 * побочные эффекты вроде уведомлений (Orders afterChange) знали, что
	 * запись создаётся/обновляется миграцией, а не реальным действием
	 * пользователя, и не рассылали письма/пуши на тысячах перенесённых записей.
	 */
	context?: Record<string, unknown>;
	/**
	 * Поля, которые пишутся ТОЛЬКО при создании записи и никогда не участвуют
	 * в сравнении hasChanges / в update. Нужно для полей вроде password —
	 * Payload требует его сразу на create() для auth-коллекций, но при
	 * повторных прогонах миграции нельзя каждый раз генерировать новый
	 * случайный пароль и затирать им уже реальный (после первого логина
	 * пользователя через legacyPasswordFallback).
	 *
	 * Сюда же относятся поля, которыми после создания владеет новая система
	 * (профиль пользователя, номер заказа): старая БД — источник истины
	 * только в момент создания записи.
	 *
	 * Можно передать функцию — тогда значения вычисляются лениво и только для
	 * реально создаваемых записей. Это важно, когда вычисление стоит запроса к
	 * БД (см. orders.migration.ts: подбор свободного orderNumber): на
	 * повторных прогонах подавляющее большинство записей уже существует, и
	 * платить за них лишним запросом не нужно. В dry-run функция всё равно
	 * вызывается — чтобы прогон показал предупреждения (например о коллизии
	 * номеров), но ничего не записал.
	 */
	createOnlyData?:
		| Record<string, unknown>
		| (() => Promise<Record<string, unknown>> | Record<string, unknown>);
}): Promise<UpsertResult> {
	const {
		ctx,
		collection,
		legacyId,
		data,
		extraWhere,
		context,
		createOnlyData,
	} = params;
	const { dryRun } = ctx;
	// Payload типизирует find/create/update по конкретному slug'у коллекции —
	// для универсальной по коллекциям миграционной утилиты это неразрешимо
	// без потери дженерик-природы функции, поэтому здесь сознательно `any`.
	const payload = ctx.payload as unknown as {
		find(
			args: Record<string, unknown>,
		): Promise<{ docs: Record<string, unknown>[] }>;
		create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
		update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
	};

	try {
		const { docs } = await payload.find({
			collection,
			where: {
				and: [
					{ legacyId: { equals: legacyId } },
					...(extraWhere ? [extraWhere] : []),
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});

		const existing = docs[0];

		if (!existing) {
			// Вычисляем ДО проверки dryRun: createOnlyData-функция может по пути
			// логировать то, ради чего dry-run и запускают (коллизия номера
			// заказа и т.п.). Записи при этом всё равно не происходит.
			const resolvedCreateOnlyData =
				typeof createOnlyData === "function"
					? await createOnlyData()
					: createOnlyData;

			if (dryRun) return { action: "created" };
			const created = await payload.create({
				collection,
				data: { ...data, ...resolvedCreateOnlyData, legacyId },
				overrideAccess: true,
				depth: 0,
				context,
			});
			return { action: "created", id: created.id as string | number };
		}

		if (!hasChanges(existing, data)) {
			return { action: "unchanged", id: existing.id as string | number };
		}

		if (dryRun)
			return { action: "updated", id: existing.id as string | number };

		await payload.update({
			collection,
			id: existing.id,
			data,
			overrideAccess: true,
			depth: 0,
			context,
		});
		return { action: "updated", id: existing.id as string | number };
	} catch (error) {
		return { action: "failed", error };
	}
}

/** Резолвит один legacy ObjectId в id новой БД через кэш ctx.getIdMap(). */
export async function resolveRef(
	ctx: MigrationContext,
	collection: string,
	legacyId: unknown,
): Promise<string | number | undefined> {
	if (!legacyId) return undefined;
	const map = await ctx.getIdMap(collection);
	return map.get(String(legacyId));
}

/** Резолвит массив legacy ObjectId'ов, молча отбрасывая нерезолвящиеся (репортится вызывающей стороной через возвращаемый unresolvedCount). */
export async function resolveRefs(
	ctx: MigrationContext,
	collection: string,
	legacyIds: unknown[] | undefined | null,
): Promise<{ ids: (string | number)[]; unresolvedCount: number }> {
	if (!legacyIds || legacyIds.length === 0)
		return { ids: [], unresolvedCount: 0 };
	const map = await ctx.getIdMap(collection);
	const ids: (string | number)[] = [];
	let unresolvedCount = 0;
	for (const legacyId of legacyIds) {
		const resolved = legacyId ? map.get(String(legacyId)) : undefined;
		if (resolved !== undefined) ids.push(resolved);
		else unresolvedCount++;
	}
	return { ids, unresolvedCount };
}
