import { randomUUID } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type { BannerClientContext } from "../conditions";
import { CONDITION_SCOPE } from "../conditions";
import {
	BANNER_COOLDOWN_MS,
	BANNER_DAILY_LIMIT,
	BANNER_IN_FLIGHT_MS,
} from "../policy";
import type { BannerView, NextBannerResponse } from "../types";
import type { BannerDefinition } from "./definitions";
import { selectBannersForUser } from "./eligibility";

// Выдача: кого показать следующим и когда.
//
// ─── Темп показов ──────────────────────────────────────────────────────────
//
// Несколько подходящих баннеров не должны навалиться разом. Здесь три
// независимых ограничителя, и каждый закрывает отказ соседа:
//
//   1. ОДИН БАННЕР В ПОЛЁТЕ. Пока человек не ответил на предыдущий баннер,
//      следующий не выдаётся вовсе. Признак — поле `inFlightSince` строки
//      состояния, снимается закрытием модалки и протухает за полчаса.
//   2. ПАУЗА МЕЖДУ ПОКАЗАМИ (`BANNER_COOLDOWN_MS`). Считается по журналу
//      событий, а не по признаку в полёте: «прошло ли пять минут с прошлого
//      показа» обязано быть верным и после того, как предыдущий показ
//      завершился.
//   3. СУТОЧНЫЙ ПРЕДЕЛ (`BANNER_DAILY_LIMIT`). Пауза сама по себе разрешает
//      почти три сотни показов за рабочий день — предел нужен отдельно.
//
// ─── Почему это решает сервер, а не вкладка ────────────────────────────────
//
// Клиент действительно показывает по одному и действительно выбирает
// вкладку-ведущего. Но клиент — это браузер: он может не дойти до показа
// (вкладка свёрнута), закрыться посреди очереди или оказаться сразу в трёх
// экземплярах. Темп показов — свойство продукта, а не вкладки, и решаться
// обязан там, где его нельзя обойти, нажав F5.
//
// ─── Чем это отличается от исходной системы ────────────────────────────────
//
// Там сервер САМ рассылал баннеры в сокет, поэтому «один в полёте» был замком
// в Redis: два процесса могли отобрать баннер одновременно, и разрешать гонку
// приходилось до записи. Здесь баннер запрашивает браузер, гонка возможна
// только между вкладками одного человека, и разрешает её сама база — уникальный
// индекс на пару «пользователь + баннер» в `banner-states` (см. коллекцию).
// Redis для этого не нужен, и это хорошо: в Полёте он необязательная
// зависимость (`REDIS_URL` опционален), и строить на нём темп показов значило
// бы сделать баннеры необязательными тоже.

export type DeliveryReason =
	| "delivered"
	| "in-flight"
	| "cooldown"
	| "daily-limit"
	| "no-candidates";

export type DeliveryOutcome = NextBannerResponse & { reason: DeliveryReason };

/**
 * Выдать пользователю следующий баннер, если это уместно прямо сейчас.
 *
 * Идемпотентна по смыслу, а не по случайности: повторный вызов, пока держится
 * признак «в полёте», ничего не выдаёт и не тратит показ. Именно поэтому её
 * безопасно дёргать и при монтировании вкладки, и после каждого закрытия
 * модалки, и при возврате фокуса.
 */
export async function deliverNextBanner(params: {
	userId: number;
	context: BannerClientContext | null;
	now?: Date;
}): Promise<DeliveryOutcome> {
	const now = params.now ?? new Date();

	const pace = await readPacing(params.userId, now);

	if (pace.inFlight) {
		// `retryAt` не называем: момент назовёт сам пользователь, закрыв модалку.
		// Таймер на «а вдруг он её уже закрыл» — это опрос под другим именем.
		return empty("in-flight", null);
	}

	if (pace.shownToday >= BANNER_DAILY_LIMIT) {
		return empty("daily-limit", startOfNextDay(now));
	}

	if (pace.lastShownAt) {
		const readyAt = new Date(pace.lastShownAt.getTime() + BANNER_COOLDOWN_MS);
		if (readyAt > now) return empty("cooldown", readyAt);
	}

	const { candidates, rejected, nextWakeUpAt } = await selectBannersForUser({
		userId: params.userId,
		context: params.context,
		now,
	});

	const next = candidates[0];

	if (!next) {
		return empty("no-candidates", nextWakeUpAt, {
			// Кто-то подошёл бы, но не на этом экране. Клиент переспросит при
			// переходе — и только тогда.
			pageBlocked: rejected.some((item) => item.reason === "wrong-page"),
		});
	}

	const impressionId = randomUUID();

	await claimDelivery({
		userId: params.userId,
		bannerId: next.definition.id,
		impressionId,
		now,
	});

	await recordDeliveredEvent({
		userId: params.userId,
		bannerId: next.definition.id,
		impressionId,
		sequence: (next.state?.impressions ?? 0) + 1,
		at: now,
		path: params.context?.path,
	});

	return {
		banner: toBannerView(next.definition),
		impressionId,
		// Следующий — не раньше паузы, и только если очередь не пуста. Но
		// спрашивать о нём всё равно незачем, пока этот не закрыт: клиент
		// вернётся сам после закрытия. Поэтому здесь `null`, а не «через пять
		// минут» — иначе вкладка ставила бы таймер, который гарантированно
		// упрётся в «в полёте».
		retryAt: null,
		pageBlocked: false,
		reason: "delivered",
	};
}

function empty(
	reason: DeliveryReason,
	retryAt: Date | null,
	extra: { pageBlocked?: boolean } = {},
): DeliveryOutcome {
	return {
		banner: null,
		impressionId: null,
		retryAt: retryAt?.toISOString() ?? null,
		pageBlocked: extra.pageBlocked ?? false,
		reason,
	};
}

/* ------------------------------------------------------------- выдача --- */

/**
 * Записать выдачу: создать или обновить состояние и занять «полёт».
 *
 * `upsert` вручную, а не `payload.create` с перехватом ошибки уникальности:
 * строка состояния живёт дольше показа (в ней накопленные счётчики), поэтому
 * подавляющее большинство выдач — это обновление существующей, а не вставка.
 */
async function claimDelivery(params: {
	userId: number;
	bannerId: number;
	impressionId: string;
	now: Date;
}): Promise<void> {
	const payload = await getPayloadInstance();

	const existing = await payload.find({
		collection: "banner-states",
		where: {
			and: [
				{ user: { equals: params.userId } },
				{ banner: { equals: params.bannerId } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	const current = existing.docs[0];

	if (current) {
		await payload.update({
			collection: "banner-states",
			id: current.id,
			data: {
				deliveries: (current.deliveries ?? 0) + 1,
				lastImpressionId: params.impressionId,
				inFlightSince: params.now.toISOString(),
			},
			overrideAccess: true,
		});
		return;
	}

	await payload.create({
		collection: "banner-states",
		data: {
			user: params.userId,
			banner: params.bannerId,
			status: "active",
			impressions: 0,
			deliveries: 1,
			ctaClicks: 0,
			totalDwellMs: 0,
			lastImpressionId: params.impressionId,
			inFlightSince: params.now.toISOString(),
		},
		overrideAccess: true,
	});
}

/** Снять «полёт»: очередь пользователя свободна для следующего баннера. */
export async function releaseInFlight(
	userId: number,
	bannerId: number,
): Promise<void> {
	const payload = await getPayloadInstance();

	await payload.update({
		collection: "banner-states",
		where: {
			and: [{ user: { equals: userId } }, { banner: { equals: bannerId } }],
		},
		data: { inFlightSince: null },
		overrideAccess: true,
	});
}

/* ----------------------------------------------------------------- темп --- */

/**
 * Три числа одним запросом: есть ли баннер в полёте, когда был последний показ
 * и сколько показов было сегодня.
 *
 * Показы считаются по событию `impression`, а не по `delivered`: выдача в
 * свёрнутую вкладку — не показ, и тратить на неё суточный лимит значит
 * наказывать человека за то, что он в этот момент не смотрел на экран.
 */
async function readPacing(
	userId: number,
	now: Date,
): Promise<{
	inFlight: boolean;
	lastShownAt: Date | null;
	shownToday: number;
}> {
	const payload = await getPayloadInstance();

	const inFlightCutoff = new Date(now.getTime() - BANNER_IN_FLIGHT_MS);
	const dayStart = startOfDay(now);

	try {
		const result = (await payload.db.drizzle.execute(sql`
			SELECT
				(
					SELECT COUNT(*) FROM banner_states
					WHERE user_id = ${userId}
						AND in_flight_since IS NOT NULL
						AND in_flight_since > ${inFlightCutoff.toISOString()}
				)::int AS in_flight,
				(
					SELECT MAX(at) FROM banner_events
					WHERE user_id = ${userId} AND kind = 'impression'
				) AS last_shown_at,
				(
					SELECT COUNT(*) FROM banner_events
					WHERE user_id = ${userId}
						AND kind = 'impression'
						AND at >= ${dayStart.toISOString()}
				)::int AS shown_today
		`)) as { rows?: Record<string, unknown>[] };

		const row = result.rows?.[0] ?? {};
		const lastShownAt = row.last_shown_at
			? new Date(String(row.last_shown_at))
			: null;

		return {
			inFlight: Number(row.in_flight ?? 0) > 0,
			lastShownAt:
				lastShownAt && !Number.isNaN(lastShownAt.getTime())
					? lastShownAt
					: null,
			shownToday: Number(row.shown_today ?? 0),
		};
	} catch (error) {
		// Не сумев посчитать темп, система не выдаёт баннер. Обратная сторона
		// («выдадим, раз не знаем») стоила бы покупателю трёх модалок подряд —
		// ровно того, от чего эти ограничители и стоят.
		console.error("[banners] Не удалось прочитать темп показов:", error);
		return { inFlight: true, lastShownAt: null, shownToday: 0 };
	}
}

function startOfDay(now: Date): Date {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	return start;
}

function startOfNextDay(now: Date): Date {
	const next = startOfDay(now);
	next.setDate(next.getDate() + 1);
	return next;
}

/* ------------------------------------------------------------- проекция --- */

/**
 * Определение → то, что уходит в браузер.
 *
 * Серверные условия отфильтрованы, и это не гигиена, а требование: список
 * условий — это сегментация клиентской базы, и отдать его каждому
 * авторизованному покупателю значит раздать коммерческую логику всем, кому она
 * не адресована. Уходят только условия `page`, потому что решать по ним
 * предстоит именно клиенту.
 */
export function toBannerView(definition: BannerDefinition): BannerView {
	return {
		id: definition.id,
		title: definition.title,
		body: definition.body,
		image: definition.image,
		cta: definition.cta,
		link: definition.link,
		importance: definition.importance,
		clientConditions: definition.conditions.filter(
			(condition) => CONDITION_SCOPE[condition.kind] === "client",
		),
		conditionMatch: definition.conditionMatch,
		// Собственная задержка баннера, и только она. Прогрев сессии
		// (`SESSION_WARMUP_SECONDS`) прибавляет клиент, потому что «экранное
		// время» знает он один: сервер видит момент запроса, а не момент, когда
		// человек посмотрел на вкладку. Складывать их сервером значило бы
		// заставить ждать полторы минуты и того, кто ходит по сайту уже час.
		delaySeconds: definition.delaySeconds,
		dwellSeconds: definition.policy.dwellSeconds,
	};
}

async function recordDeliveredEvent(params: {
	userId: number;
	bannerId: number;
	impressionId: string;
	sequence: number;
	at: Date;
	path?: string;
}): Promise<void> {
	const payload = await getPayloadInstance();

	try {
		await payload.create({
			collection: "banner-events",
			data: {
				banner: params.bannerId,
				user: params.userId,
				impressionId: params.impressionId,
				kind: "delivered",
				at: params.at.toISOString(),
				sequence: params.sequence,
				path: params.path,
			},
			overrideAccess: true,
		});
	} catch (error) {
		// Журнал не должен ронять выдачу: баннер уже отобран, состояние уже
		// обновлено, и отказ здесь стоил бы покупателю показа ради строки в
		// аналитике.
		console.warn(
			`[banners] Не удалось записать выдачу баннера ${params.bannerId}:`,
			error,
		);
	}
}
