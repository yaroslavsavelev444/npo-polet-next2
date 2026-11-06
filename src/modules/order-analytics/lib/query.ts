import {
	ANALYTICS_TIMEZONE,
	type AnalyticsSection,
	COMPARE_MODES,
	type CompareMode,
	CUSTOMER_TYPES,
	type CustomerType,
	DELIVERY_METHODS,
	GRANULARITIES,
	type Granularity,
	type GranularityChoice,
	ORDER_STATUSES,
	PAYMENT_METHODS,
	PAYMENT_STATUSES,
	PERIODS,
	type PeriodKey,
	PRODUCT_SORTS,
	type ProductSort,
	SECTIONS,
	SOURCES,
	STATUS_GROUPS,
	type StatusGroup,
} from "./constants.ts";

/**
 * Разбор параметров аналитики: адресная строка страницы и запрос к эндпоинту —
 * одно и то же, поэтому ссылкой на отчёт можно поделиться с коллегой.
 *
 * Всё, что попадёт в SQL, проверяется здесь по белым спискам. Значения всё
 * равно уходят параметрами запроса; белый список нужен, чтобы опечатка в
 * адресе давала понятный ответ 400, а не пустой отчёт, похожий на настоящий.
 */

export class AnalyticsQueryError extends Error {}

/** Календарный день YYYY-MM-DD в поясе аналитики. */
export interface DateRange {
	from: string;
	to: string;
}

export interface AnalyticsFilters {
	statuses: readonly string[] | null;
	customerType: CustomerType | null;
	delivery: string | null;
	payment: string | null;
	paymentStatus: string | null;
	source: string | null;
	categoryId: number | null;
	region: string | null;
}

export interface ProductTableQuery {
	page: number;
	sort: ProductSort;
	dir: "asc" | "desc";
	search: string;
}

export interface AnalyticsQuery {
	section: AnalyticsSection;
	period: PeriodKey;
	/** null — «всё время»: начало определяет первый заказ в базе. */
	range: { from: string | null; to: string };
	compareMode: CompareMode;
	granularity: GranularityChoice;
	filters: AnalyticsFilters;
	products: ProductTableQuery;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REGION_LENGTH = 200;
const MAX_SEARCH_LENGTH = 100;

export function todayInAnalyticsZone(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: ANALYTICS_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

function toUtc(date: string): number {
	const [year, month, day] = date.split("-").map(Number);
	return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
	return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysInRange(range: DateRange): number {
	return Math.round((toUtc(range.to) - toUtc(range.from)) / DAY_MS) + 1;
}

function isRealDate(value: string): boolean {
	return DATE_RE.test(value) && fromUtc(toUtc(value)) === value;
}

/** Тот же день год назад; 29 февраля — 28 февраля. */
export function shiftYear(date: string, years = -1): string {
	const [year, month, day] = date.split("-").map(Number);
	const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
	return fromUtc(Date.UTC(year + years, month - 1, Math.min(day, lastDay)));
}

export function resolvePeriod(
	period: PeriodKey,
	today: string,
	custom: { from?: string | null; to?: string | null } = {},
): { from: string | null; to: string } {
	const [year, month] = today.split("-").map(Number);
	const lastDays = (count: number) => ({
		from: addDays(today, 1 - count),
		to: today,
	});
	switch (period) {
		case "7d":
			return lastDays(7);
		case "30d":
			return lastDays(30);
		case "90d":
			return lastDays(90);
		case "365d":
			return lastDays(365);
		case "mtd":
			return { from: fromUtc(Date.UTC(year, month - 1, 1)), to: today };
		case "last_month":
			return {
				from: fromUtc(Date.UTC(year, month - 2, 1)),
				to: fromUtc(Date.UTC(year, month - 1, 0)),
			};
		case "qtd": {
			const quarterStart = Math.floor((month - 1) / 3) * 3;
			return { from: fromUtc(Date.UTC(year, quarterStart, 1)), to: today };
		}
		case "ytd":
			return { from: fromUtc(Date.UTC(year, 0, 1)), to: today };
		case "last_year":
			return {
				from: fromUtc(Date.UTC(year - 1, 0, 1)),
				to: fromUtc(Date.UTC(year - 1, 11, 31)),
			};
		case "all":
			return { from: null, to: today };
		case "custom": {
			const { from, to } = custom;
			if (!from || !to || !isRealDate(from) || !isRealDate(to)) {
				throw new AnalyticsQueryError(
					"Для своего периода укажите начало и конец в формате ГГГГ-ММ-ДД",
				);
			}
			if (from > to) {
				throw new AnalyticsQueryError("Начало периода позже его конца");
			}
			return { from, to };
		}
	}
}

/**
 * Период сравнения. «Предыдущий» — столько же дней сразу перед выбранным:
 * сравнивать 30 дней с 31 днём календарного месяца значит сравнивать разную
 * длительность. «Прошлый год» — те же даты: снимает сезонность.
 */
export function resolveCompareRange(
	range: DateRange,
	mode: CompareMode,
): DateRange | null {
	if (mode === "none") return null;
	if (mode === "year") {
		return { from: shiftYear(range.from), to: shiftYear(range.to) };
	}
	const to = addDays(range.from, -1);
	return { from: addDays(to, 1 - daysInRange(range)), to };
}

/**
 * Шаг графика. Точек не больше нескольких сотен при любом периоде: ручной
 * выбор «по дням» на многолетнем периоде загрубляется до недель.
 */
export function resolveGranularity(
	choice: GranularityChoice,
	days: number,
): Granularity {
	if (choice === "month") return "month";
	if (choice === "week") return days > 1500 ? "month" : "week";
	if (choice === "day") {
		if (days > 1500) return "month";
		return days > 400 ? "week" : "day";
	}
	if (days <= 62) return "day";
	return days <= 270 ? "week" : "month";
}

function oneOf<T extends string>(
	value: string | null,
	allowed: readonly T[],
	name: string,
): T | null {
	if (value === null || value === "") return null;
	if ((allowed as readonly string[]).includes(value)) return value as T;
	throw new AnalyticsQueryError(`Недопустимое значение параметра ${name}`);
}

function parseStatuses(value: string | null): readonly string[] | null {
	if (!value) return null;
	if (value in STATUS_GROUPS) return STATUS_GROUPS[value as StatusGroup];
	return [oneOf(value, ORDER_STATUSES, "status") as string];
}

export function parseAnalyticsQuery(
	params: URLSearchParams,
	now: Date = new Date(),
): AnalyticsQuery {
	const section =
		oneOf(params.get("section"), SECTIONS, "section") ?? "overview";
	const period =
		oneOf(
			params.get("period"),
			PERIODS.map((p) => p.key),
			"period",
		) ?? "30d";
	const range = resolvePeriod(period, todayInAnalyticsZone(now), {
		from: params.get("from"),
		to: params.get("to"),
	});

	const rawCategory = params.get("category");
	const categoryId = rawCategory ? Number(rawCategory) : null;
	if (
		categoryId !== null &&
		(!Number.isSafeInteger(categoryId) || categoryId <= 0)
	) {
		throw new AnalyticsQueryError("Недопустимое значение параметра category");
	}

	const region = params.get("region") || null;
	if (region && region.length > MAX_REGION_LENGTH) {
		throw new AnalyticsQueryError("Недопустимое значение параметра region");
	}

	const rawPage = Number(params.get("page") ?? 1);

	return {
		section,
		period,
		range,
		compareMode:
			oneOf(
				params.get("compare"),
				COMPARE_MODES.map((m) => m.key),
				"compare",
			) ?? "previous",
		granularity:
			oneOf(
				params.get("granularity"),
				GRANULARITIES.map((g) => g.key),
				"granularity",
			) ?? "auto",
		filters: {
			statuses: parseStatuses(params.get("status")),
			customerType: oneOf(
				params.get("customerType"),
				CUSTOMER_TYPES,
				"customerType",
			),
			delivery: oneOf(params.get("delivery"), DELIVERY_METHODS, "delivery"),
			payment: oneOf(params.get("payment"), PAYMENT_METHODS, "payment"),
			paymentStatus: oneOf(
				params.get("paymentStatus"),
				PAYMENT_STATUSES,
				"paymentStatus",
			),
			source: oneOf(params.get("source"), SOURCES, "source"),
			categoryId,
			region,
		},
		products: {
			page:
				Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage < 100_000
					? rawPage
					: 1,
			sort: oneOf(params.get("sort"), PRODUCT_SORTS, "sort") ?? "revenue",
			dir: oneOf(params.get("dir"), ["asc", "desc"] as const, "dir") ?? "desc",
			search: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
		},
	};
}
