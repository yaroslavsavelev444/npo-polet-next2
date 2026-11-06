/** Числа и даты на странице аналитики. */

const INTEGER = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const COMPACT = new Intl.NumberFormat("ru-RU", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
});

export const DASH = "—";

export function int(value: number | null | undefined): string {
	return value === null || value === undefined ? DASH : INTEGER.format(value);
}

export function dec(value: number | null | undefined): string {
	return value === null || value === undefined ? DASH : DECIMAL.format(value);
}

export function money(value: number | null | undefined): string {
	return value === null || value === undefined
		? DASH
		: `${INTEGER.format(value)} ₽`;
}

/** Деньги на карточке и оси: крупные суммы короче, точное значение — в подсказке. */
export function moneyCompact(value: number | null | undefined): string {
	if (value === null || value === undefined) return DASH;
	const abs = Math.abs(value);
	if (abs >= 1_000_000_000) return `${COMPACT.format(value / 1e9)} млрд ₽`;
	if (abs >= 1_000_000) return `${COMPACT.format(value / 1e6)} млн ₽`;
	return `${INTEGER.format(value)} ₽`;
}

export function axisNumber(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${COMPACT.format(value / 1e6)} млн`;
	if (abs >= 10_000) return `${COMPACT.format(value / 1e3)} тыс`;
	return INTEGER.format(value);
}

export function pct(value: number | null | undefined, digits = 1): string {
	if (value === null || value === undefined) return DASH;
	return `${(value * 100).toLocaleString("ru-RU", {
		maximumFractionDigits: digits,
	})}%`;
}

const MONTHS_SHORT = [
	"янв",
	"фев",
	"мар",
	"апр",
	"мая",
	"июн",
	"июл",
	"авг",
	"сен",
	"окт",
	"ноя",
	"дек",
];
const MONTHS_FULL = [
	"Январь",
	"Февраль",
	"Март",
	"Апрель",
	"Май",
	"Июнь",
	"Июль",
	"Август",
	"Сентябрь",
	"Октябрь",
	"Ноябрь",
	"Декабрь",
];

function parts(date: string) {
	const [year, month, day] = date.split("-").map(Number);
	return { year, month, day };
}

export function dayLabel(date: string, withYear = false): string {
	const { year, month, day } = parts(date);
	return `${day} ${MONTHS_SHORT[month - 1]}${withYear ? ` ${year}` : ""}`;
}

export function monthLabel(date: string): string {
	const { year, month } = parts(date);
	return `${MONTHS_FULL[month - 1]} ${year}`;
}

export function monthShort(date: string): string {
	const { year, month } = parts(date);
	return `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`;
}

export function rangeLabel(from: string, to: string): string {
	const sameYear = from.slice(0, 4) === to.slice(0, 4);
	return `${dayLabel(from, !sameYear)} – ${dayLabel(to, true)}`;
}

export function dateTimeLabel(iso: string): string {
	return new Intl.DateTimeFormat("ru-RU", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Europe/Moscow",
	}).format(new Date(iso));
}

export function hoursLabel(hours: number | null): string {
	if (hours === null) return DASH;
	if (hours < 48) return `${dec(hours)} ч`;
	return `${dec(hours / 24)} дн.`;
}

/** Склонение: plural(3, ["заказ", "заказа", "заказов"]). */
export function plural(
	value: number,
	forms: readonly [string, string, string],
): string {
	const abs = Math.abs(value) % 100;
	const last = abs % 10;
	if (abs > 10 && abs < 20) return forms[2];
	if (last > 1 && last < 5) return forms[1];
	return last === 1 ? forms[0] : forms[2];
}
