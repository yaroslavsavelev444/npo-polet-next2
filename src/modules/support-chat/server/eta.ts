import type { Weekday } from "../lib/constants.ts";
import type { EtaDTO } from "../lib/events.ts";
import type { SupportConfig } from "./settings.ts";

/**
 * Рабочее время поддержки и оценка «через сколько ответим».
 *
 * Чистые функции без базы и Redis: всё, что нужно, передаётся аргументами.
 * Время всегда считается в часовом поясе поддержки из настроек, а не в поясе
 * сервера (контейнер живёт в UTC) и не в поясе покупателя.
 */

type Schedule = Pick<SupportConfig, "timezone" | "schedule" | "holidays">;

const WEEKDAY_BY_SHORT: Record<string, Weekday> = {
	Mon: "mon",
	Tue: "tue",
	Wed: "wed",
	Thu: "thu",
	Fri: "fri",
	Sat: "sat",
	Sun: "sun",
};
const WEEKDAY_BY_INDEX: Weekday[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

/** «в понедельник», «во вторник» — для подписи ближайшего рабочего дня. */
const WEEKDAY_PHRASE: Record<Weekday, string> = {
	mon: "в понедельник",
	tue: "во вторник",
	wed: "в среду",
	thu: "в четверг",
	fri: "в пятницу",
	sat: "в субботу",
	sun: "в воскресенье",
};

interface ZonedParts {
	year: number;
	month: number;
	day: number;
	weekday: Weekday;
	/** Минуты от полуночи. */
	minutes: number;
	dateKey: string;
}

export function zonedParts(date: Date, timezone: string): ZonedParts {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			weekday: "short",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(date)
			.map((part) => [part.type, part.value]),
	);
	const year = Number(parts.year);
	const month = Number(parts.month);
	const day = Number(parts.day);
	return {
		year,
		month,
		day,
		weekday: WEEKDAY_BY_SHORT[parts.weekday],
		minutes: Number(parts.hour) * 60 + Number(parts.minute),
		dateKey: `${parts.year}-${parts.month}-${parts.day}`,
	};
}

/** Смещение пояса относительно UTC в момент `date`, мс. */
function zoneOffsetMs(date: Date, timezone: string): number {
	const p = zonedParts(date, timezone);
	const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes);
	return wallAsUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/**
 * Момент, когда в поясе `timezone` на часах `minutes` дня (y, m, d).
 * Вторая итерация нужна на днях перевода часов: смещение в «угаданный» момент
 * и в настоящий может различаться.
 */
function zonedTimeToUtc(
	year: number,
	month: number,
	day: number,
	minutes: number,
	timezone: string,
): Date {
	const wall = Date.UTC(year, month - 1, day, 0, minutes);
	const first = wall - zoneOffsetMs(new Date(wall), timezone);
	const second = wall - zoneOffsetMs(new Date(first), timezone);
	return new Date(second);
}

/** Рабочий интервал, в который попадает `now`; null — нерабочее время. */
export function currentInterval(
	now: Date,
	schedule: Schedule,
): Schedule["schedule"][number] | null {
	const p = zonedParts(now, schedule.timezone);
	if (schedule.holidays.has(p.dateKey)) return null;
	return (
		schedule.schedule.find(
			(interval) =>
				interval.day === p.weekday &&
				p.minutes >= interval.opensAt &&
				p.minutes < interval.closesAt,
		) ?? null
	);
}

export function isWithinWorkingHours(now: Date, schedule: Schedule): boolean {
	return currentInterval(now, schedule) !== null;
}

export interface NextOpening {
	at: Date;
	/** Сколько календарных дней (в поясе поддержки) до открытия: 0 — сегодня. */
	daysAhead: number;
	weekday: Weekday;
	opensAt: number;
}

/**
 * Ближайшее начало рабочего интервала после `now` (или `now`, если сейчас
 * рабочее время). Две недели вперёд — дальше расписание без единого рабочего
 * интервала считается пустым, и ответ — null.
 */
export function nextOpening(now: Date, schedule: Schedule): NextOpening | null {
	if (isWithinWorkingHours(now, schedule)) {
		const p = zonedParts(now, schedule.timezone);
		return { at: now, daysAhead: 0, weekday: p.weekday, opensAt: p.minutes };
	}

	const today = zonedParts(now, schedule.timezone);
	for (let daysAhead = 0; daysAhead <= 14; daysAhead++) {
		const calendar = new Date(
			Date.UTC(today.year, today.month - 1, today.day + daysAhead),
		);
		const dateKey = calendar.toISOString().slice(0, 10);
		if (schedule.holidays.has(dateKey)) continue;

		const weekday = WEEKDAY_BY_INDEX[calendar.getUTCDay()];
		const opensAt = schedule.schedule
			.filter((interval) => interval.day === weekday)
			.map((interval) => interval.opensAt)
			.filter((minutes) => daysAhead > 0 || minutes > today.minutes)
			.sort((a, b) => a - b)[0];
		if (opensAt === undefined) continue;

		return {
			at: zonedTimeToUtc(
				calendar.getUTCFullYear(),
				calendar.getUTCMonth() + 1,
				calendar.getUTCDate(),
				opensAt,
				schedule.timezone,
			),
			daysAhead,
			weekday,
			opensAt,
		};
	}
	return null;
}

function formatClock(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function openingPhrase(opening: NextOpening): string {
	const day =
		opening.daysAhead === 0
			? "сегодня"
			: opening.daysAhead === 1
				? "завтра"
				: WEEKDAY_PHRASE[opening.weekday];
	return `${day} с ${formatClock(opening.opensAt)}`;
}

/**
 * Корзины вместо точных минут. Оценка — прогноз, и «через 7 минут» обещает
 * больше, чем мы знаем; «обычно за несколько минут» — честно.
 */
const BUCKETS: ReadonlyArray<{ upTo: number; label: string }> = [
	{ upTo: 5, label: "Обычно отвечаем за несколько минут" },
	{ upTo: 15, label: "Обычно отвечаем в течение 15 минут" },
	{ upTo: 30, label: "Обычно отвечаем в течение получаса" },
	{ upTo: 60, label: "Обычно отвечаем в течение часа" },
];

/** Сколько добавляет к ожиданию каждый диалог очереди на одного менеджера. */
const MINUTES_PER_QUEUED = 3;
/** Типичное время ответа, пока нет статистики. */
const DEFAULT_TYPICAL_MINUTES = 3;

export interface EtaInput {
	now: Date;
	config: Pick<SupportConfig, "timezone" | "schedule" | "holidays" | "routing">;
	/** Менеджеров со статусом «на месте». */
	availableAgents: number;
	/** Диалогов, ждущих ответа. */
	queueDepth: number;
	/** Медиана первого ответа по статистике, если она уже есть. */
	typicalFirstResponseMinutes?: number | null;
}

export function computeEta(input: EtaInput): EtaDTO {
	const { now, config } = input;

	const interval = currentInterval(now, config);
	if (!interval) {
		const opening = nextOpening(now, config);
		return {
			online: false,
			minutes: null,
			nextOpenAt: opening?.at.toISOString() ?? null,
			label: opening
				? `Сейчас нерабочее время — ответим ${openingPhrase(opening)}`
				: "Сейчас нерабочее время — ответим, как только начнём работу",
		};
	}

	const sla = interval.slaMinutes ?? config.routing.firstResponseSlaMinutes;
	let estimate: number;
	if (input.availableAgents === 0) {
		// Рабочее время, но на месте никого: честнее всего обещание из настроек.
		estimate = sla;
	} else {
		const typical =
			input.typicalFirstResponseMinutes ?? DEFAULT_TYPICAL_MINUTES;
		// Лимитов на менеджера нет: очередь делится между всеми на месте.
		const waiting =
			Math.ceil(input.queueDepth / input.availableAgents) * MINUTES_PER_QUEUED;
		estimate = Math.max(1, typical + waiting);
	}
	// Интервал со своим сроком (выходные) — «медленнее» по решению владельца:
	// обещаем не быстрее этого срока, даже если сейчас все свободны.
	if (interval.slaMinutes !== null)
		estimate = Math.max(estimate, interval.slaMinutes);

	const bucket = BUCKETS.find((candidate) => estimate <= candidate.upTo);
	return {
		online: true,
		minutes: bucket?.upTo ?? null,
		nextOpenAt: null,
		label: bucket?.label ?? "Ответим в течение нескольких часов",
	};
}
