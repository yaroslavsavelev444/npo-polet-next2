/**
 * Форматирование данных кабинета.
 *
 * Отдельный файл, а не функции внутри компонентов: одни и те же величины
 * показываются в нескольких местах (дата последнего входа — в блоке личности
 * и в хвосте страницы, склонение сессий — в навигации и в шапке списка), и
 * разъехавшиеся форматы в одном интерфейсе выглядят браком.
 */

const DATE_TIME = new Intl.DateTimeFormat("ru-RU", {
	day: "2-digit",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("ru-RU", {
	day: "2-digit",
	month: "long",
	year: "numeric",
});

export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}

export function formatDate(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? "—" : DATE_ONLY.format(date);
}

/**
 * «5 минут назад», «вчера», «12 сен».
 *
 * Для списка устройств это важнее абсолютного времени: вопрос у списка
 * сессий один — «это я только что заходил или кто-то другой позавчера», и
 * ответ на него в относительной шкале читается без вычитания в уме.
 *
 * Абсолютное значение при этом никуда не девается: компонент показывает его в
 * подсказке и в атрибуте datetime.
 */
export function formatRelative(iso: string, now = Date.now()): string {
	const time = new Date(iso).getTime();
	if (Number.isNaN(time)) return "—";

	const diff = Math.max(0, now - time);
	const minutes = Math.floor(diff / 60_000);

	if (minutes < 1) return "только что";
	if (minutes < 60)
		return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24)
		return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;

	const days = Math.floor(hours / 24);
	if (days === 1) return "вчера";
	if (days < 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;

	return formatDateTime(iso);
}

/** Русское склонение по числу. */
export function plural(
	count: number,
	one: string,
	few: string,
	many: string,
): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
	return many;
}

export function pluralSessions(count: number): string {
	return plural(count, "устройство", "устройства", "устройств");
}

/**
 * Монограмма из ФИО: первые буквы первых двух слов.
 *
 * Запасной вариант — первая буква почты: у аккаунта, зарегистрированного без
 * имени, пустой квадрат выглядел бы ошибкой загрузки.
 */
export function initialsOf(name: string, email: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const letters = words.slice(0, 2).map((word) => word[0]);
	if (letters.length > 0) return letters.join("").toUpperCase();
	return (email.trim()[0] ?? "?").toUpperCase();
}

/** Человеческое имя роли. Неизвестное значение показываем как есть. */
export function roleLabel(role: string): string {
	switch (role) {
		case "customer":
			return "Покупатель";
		case "admin":
			return "Администратор";
		case "manager":
			return "Менеджер";
		default:
			return role;
	}
}

export interface StatusView {
	label: string;
	tone: "ok" | "warn" | "danger";
}

/**
 * Статус аккаунта. Показывается ТОЛЬКО когда он не «активен»: подпись
 * «активен» рядом с именем ничего не сообщает — в кабинет и так пускают
 * только действующий аккаунт, — а вот приостановка обязана быть на виду.
 */
export function statusView(status: string): StatusView | null {
	switch (status) {
		case "active":
			return null;
		case "suspended":
			return { label: "Приостановлен", tone: "warn" };
		case "blocked":
			return { label: "Заблокирован", tone: "danger" };
		case "pending":
			return { label: "Ожидает подтверждения", tone: "warn" };
		default:
			return { label: status, tone: "warn" };
	}
}
