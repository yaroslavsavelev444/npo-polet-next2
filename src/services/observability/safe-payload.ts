import { formatFrame, scrubMessage } from "./normalize.ts";
import { userPseudonym } from "./pseudonym.ts";
import type { AlertStats, ErrorEvent, SafeAlert } from "./types.ts";

// Граница сервера. Всё, что уходит письмом, проходит здесь и нигде больше.
//
// ─── Белый список, а не чёрный ──────────────────────────────────────────────
//
// Функция ниже не «убирает лишнее» из `ErrorEvent`, а СОБИРАЕТ НОВЫЙ ОБЪЕКТ
// из перечисленных полей. Поле, добавленное в `CaptureContext` завтра, не
// попадёт в письмо, пока кто-то не впишет его сюда руками, то есть пока это
// не пройдёт ревью.
//
// Чего здесь нет и не появится без отдельного решения: `userId` (только
// псевдоним), `ip`, `userAgent`, `http.path` (только шаблон маршрута),
// `extra`, `rawMessage`, `rawStack`. Всё это остаётся в журнале
// `error-events` и открывается суперадминистратором в карточке записи.
//
// Почему это важно именно здесь: письмо уходит во внешний почтовый ящик и
// хранится там неограниченно, без возможности удалить по требованию субъекта
// (152-ФЗ). Персональным данным покупателей в нём не место — а в заказах
// Polet это ФИО, телефоны, адреса доставки и реквизиты компаний.

const MAX_FRAMES = 10;

const MAX_CAUSES = 3;

/**
 * Сегмент пути, который почти наверняка значение, а не имя: число (id
 * записи, номер заказа) или UUID.
 */
const VALUE_SEGMENT =
	/^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i;

/**
 * Фактический путь → шаблон: `/orders/100245` → `/orders/[value]`.
 *
 * Страховка для точек перехвата, у которых нет шаблона маршрута. Query
 * отбрасывается целиком — там поисковые запросы и параметры фильтров.
 */
export function maskPath(pathname: string): string {
	const [path = ""] = pathname.split(/[?#]/, 1);

	return path
		.split("/")
		.map((segment) =>
			segment.length > 0 && VALUE_SEGMENT.test(segment) ? "[value]" : segment,
		)
		.join("/");
}

function formatAttempt(
	attempt: number | undefined,
	maxAttempts: number | undefined,
): string | undefined {
	if (attempt === undefined) return undefined;
	return maxAttempts === undefined
		? String(attempt)
		: `${attempt} / ${maxAttempts}`;
}

/**
 * Собрать то, что можно отправить.
 *
 * Чистая функция — ради теста, который прогоняет сюда фикстуры с адресами,
 * телефонами и ИНН и проверяет, что ни одна подстрока не дошла до результата.
 */
export function toSafeAlert(
	event: ErrorEvent,
	stats: AlertStats,
	adminUrl?: string,
): SafeAlert {
	const { error, context } = event;

	const http = context.http
		? {
				method: context.http.method,
				// Шаблон, а не путь. Если точка перехвата шаблона не знает, а путь
				// передала — маскируем путь, а не отправляем его как есть.
				route:
					context.http.route ??
					(context.http.path ? maskPath(context.http.path) : undefined),
				status: context.http.status,
			}
		: undefined;

	const job = context.job
		? {
				queue: context.job.queue,
				name: context.job.name,
				attempt: formatAttempt(context.job.attempt, context.job.maxAttempts),
			}
		: undefined;

	return {
		errorId: event.errorId,
		fingerprint: event.fingerprint,
		...(adminUrl ? { adminUrl } : {}),
		at: event.at.toISOString(),
		severity: event.severity,
		environment: event.environment,
		processName: event.processName,
		hostname: event.hostname,
		source: context.source,
		module: context.module,
		// Имя и код тоже чистятся: у брошенного не-Error объекта это
		// произвольные строки, а не имя класса.
		errorName: scrubMessage(error.name).slice(0, 120),
		// Повторная очистка: это последняя точка перед отправкой, и она не
		// вправе доверять тому, что выше по течению всё сделано правильно.
		message: scrubMessage(error.message),
		code: error.code ? scrubMessage(error.code) : undefined,
		frames: error.frames.slice(0, MAX_FRAMES).map(formatFrame),
		causes: error.causes
			.slice(0, MAX_CAUSES)
			.map((cause) => `${cause.name}: ${scrubMessage(cause.message)}`),
		...(http ? { http } : {}),
		...(job ? { job } : {}),
		userRef: userPseudonym(context.userId),
		stats: {
			occurrences: stats.occurrences,
			firstSeen: stats.firstSeen.toISOString(),
			lastSeen: stats.lastSeen.toISOString(),
			suppressed: stats.suppressed,
			sendCount: stats.sendCount,
			trigger: stats.trigger,
			budgetExhausted: stats.budgetExhausted,
			budgetSuppressed: stats.budgetSuppressed,
			degraded: stats.degraded,
		},
	};
}
