const timeFormat = new Intl.DateTimeFormat("ru-RU", {
	hour: "2-digit",
	minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "short",
});
const fullFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
	hour: "2-digit",
	minute: "2-digit",
});

const sameDay = (a: Date, b: Date) =>
	a.getFullYear() === b.getFullYear() &&
	a.getMonth() === b.getMonth() &&
	a.getDate() === b.getDate();

/** «14:05» сегодня, «3 окт.» раньше. */
export function shortTime(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	return sameDay(date, new Date())
		? timeFormat.format(date)
		: dateFormat.format(date);
}

export function fullTime(iso: string | null): string {
	return iso ? fullFormat.format(new Date(iso)) : "";
}

export function dayLabel(iso: string): string {
	const date = new Date(iso);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);
	if (sameDay(date, today)) return "Сегодня";
	if (sameDay(date, yesterday)) return "Вчера";
	return new Intl.DateTimeFormat("ru-RU", {
		day: "numeric",
		month: "long",
	}).format(date);
}

/** Сколько ждёт ответа: «3 мин», «1 ч 20 мин», «2 дн». */
export function waitingFor(
	iso: string | null,
	now = Date.now(),
): string | null {
	if (!iso) return null;
	const minutes = Math.max(
		0,
		Math.floor((now - new Date(iso).getTime()) / 60_000),
	);
	if (minutes < 1) return "только что";
	if (minutes < 60) return `${minutes} мин`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24)
		return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
	return `${Math.floor(hours / 24)} дн`;
}

export function waitingMinutes(iso: string | null, now = Date.now()): number {
	return iso ? (now - new Date(iso).getTime()) / 60_000 : 0;
}

export function fileSize(bytes: number | null): string {
	if (!bytes) return "";
	if (bytes < 1024) return `${bytes} Б`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function money(value: number | null): string {
	return value === null
		? ""
		: new Intl.NumberFormat("ru-RU", {
				style: "currency",
				currency: "RUB",
				maximumFractionDigits: 0,
			}).format(value);
}
