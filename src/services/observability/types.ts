// Словарь системы сбора серверных ошибок (см. README.md рядом).
//
// ─── Почему типов два, а не один ────────────────────────────────────────────
//
// `ErrorEvent` — то, что остаётся на сервере: исходный текст ошибки, стек,
// идентификатор пользователя, IP, контекст. `SafeAlert` — то, что уходит за
// пределы сервера письмом. Это разные типы, а не один с необязательными
// полями: поле, которого в `SafeAlert` нет, невозможно отправить по
// забывчивости. Переход между ними — ровно одна функция (`toSafeAlert` в
// `safe-payload.ts`), и она устроена как белый список.

/**
 * Уровень, по которому принимается решение об отправке. `info` здесь нет:
 * сюда попадает только то, что сломалось.
 */
export type Severity = "warning" | "error" | "fatal";

export const SEVERITY_ORDER: Record<Severity, number> = {
	warning: 10,
	error: 20,
	fatal: 30,
};

/**
 * Откуда пришла ошибка. Список закрыт: новый источник добавляется сюда, а не
 * произвольной строкой — иначе отпечаток перестаёт быть стабильным.
 */
export type ErrorSource =
	| "http" // маршрут, отдавший 5xx
	| "action" // Server Action
	| "render" // рендер серверного компонента
	| "payload" // REST/GraphQL/админка Payload (hooks.afterError)
	| "job" // задача BullMQ
	| "process"; // необработанное исключение / отказ процесса

/** Имя процесса. Воркеры объявляют себя сами при старте. */
export type ProcessName = "web" | "worker";

export type StackFrame = {
	fn?: string;
	/** Путь, уже укороченный до корня проекта. */
	file: string;
	line?: number;
	column?: number;
	/** Кадр из `node_modules` или внутренностей Node. */
	vendor: boolean;
};

/**
 * Контекст, который передаёт точка перехвата.
 *
 * Поля с пометкой «сырое» не покидают сервер: они пишутся в `error-events` и
 * отбрасываются при построении `SafeAlert`.
 */
export type CaptureContext = {
	source: ErrorSource;
	/** По умолчанию выводится из источника — см. `defaultSeverity`. */
	severity?: Severity;
	/** Логический модуль: `api/search`, `checkout`, `restock/worker`. */
	module?: string;
	http?: {
		method?: string;
		/** Шаблон маршрута (`/api/notifications/[id]`) — уходит в письмо. */
		route?: string;
		/** Сырое: фактический путь со значениями и query. */
		path?: string;
		status?: number;
	};
	job?: {
		queue?: string;
		name?: string;
		id?: string;
		attempt?: number;
		maxAttempts?: number;
	};
	/** Сырое: в письмо уходит только псевдоним (`pseudonym.ts`). */
	userId?: string | number | null;
	/** Сырое. */
	ip?: string | null;
	/** Сырое. */
	userAgent?: string | null;
	/** Сырое: произвольный доменный контекст. */
	extra?: Record<string, unknown>;
};

/** Ошибка, приведённая к общему виду. */
export type NormalizedError = {
	name: string;
	/** Исходное сообщение. Только для записи на сервере. */
	rawMessage: string;
	/**
	 * Сообщение с вычищенными значениями — то, что уходит в письмо. См.
	 * `normalize.ts`: Drizzle кладёт в текст ошибки параметры запроса, а
	 * Postgres — само нарушившее уникальность значение.
	 */
	message: string;
	/** Машинный код: `23505`, `ECONNREFUSED`, `EmailDeliveryError`. */
	code?: string;
	frames: StackFrame[];
	/** Исходный стек целиком. Только для записи на сервере. */
	rawStack?: string;
	/** Цепочка `cause`, уже нормализованная. */
	causes: { name: string; message: string }[];
	/** Та же цепочка как есть. Только для записи на сервере. */
	rawCauses: { name: string; message: string }[];
};

/** Полная запись о происшествии. Живёт только на сервере. */
export type ErrorEvent = {
	errorId: string;
	fingerprint: string;
	at: Date;
	severity: Severity;
	environment: string;
	processName: ProcessName;
	hostname: string;
	error: NormalizedError;
	context: CaptureContext;
};

export type AlertTrigger =
	/** Отпечаток встретился впервые (или после долгой тишины). */
	| "new"
	/** Истекла пауза — уходит сводка. */
	| "cooldown-expired"
	/** Частота выросла на порядок — пауза прервана. */
	| "burst";

/** Счётчики повторов, которые собирает `policy.ts`. */
export type AlertStats = {
	occurrences: number;
	firstSeen: Date;
	lastSeen: Date;
	/** Сколько повторов подавлено с прошлой отправки. */
	suppressed: number;
	/** Номер отправки по этому отпечатку: 1 — первая. */
	sendCount: number;
	trigger: AlertTrigger;
	/**
	 * Это письмо — последнее в часовом лимите. Без этой строки тишина после
	 * исчерпания лимита неотличима от тишины после починки.
	 */
	budgetExhausted: boolean;
	/** Сколько писем съел часовой лимит с прошлой успешной отправки. */
	budgetSuppressed: number;
	/**
	 * Решение принято без Redis, по счётчикам одного процесса. Письмо честно
	 * об этом сообщает.
	 */
	degraded: boolean;
};

/**
 * То, и только то, что покидает сервер.
 *
 * Здесь нет `userId`, `ip`, `userAgent`, `http.path`, `extra`, `rawMessage`
 * и `rawStack`. Это предмет теста `tests/observability/safe-payload.test.ts`.
 */
export type SafeAlert = {
	errorId: string;
	fingerprint: string;
	/** Ссылка на карточку в админке. Номер записи журнала — не ПДн. */
	adminUrl?: string;
	at: string;
	severity: Severity;
	environment: string;
	processName: ProcessName;
	hostname: string;
	source: ErrorSource;
	module?: string;
	errorName: string;
	message: string;
	code?: string;
	frames: string[];
	causes: string[];
	http?: { method?: string; route?: string; status?: number };
	job?: { queue?: string; name?: string; attempt?: string };
	/** HMAC-псевдоним пользователя вида `u:a3f1c2d4` — «тот же / другой». */
	userRef?: string;
	stats: {
		occurrences: number;
		firstSeen: string;
		lastSeen: string;
		suppressed: number;
		sendCount: number;
		trigger: AlertTrigger;
		budgetExhausted: boolean;
		budgetSuppressed: number;
		degraded: boolean;
	};
};

/**
 * Исход доставки. Доставка не бросает исключений наружу: неудача отправки
 * оповещения не имеет права стать второй ошибкой поверх той, о которой
 * оповещали.
 */
export type DeliveryResult =
	| { status: "sent" }
	| { status: "skipped"; reason: string }
	| { status: "retryable"; reason: string }
	| { status: "permanent"; reason: string };

/**
 * Настройки, от которых зависит решение об отправке.
 *
 * Объявлены здесь, а не рядом с чтением глобала, чтобы политика и её тесты не
 * тянули за собой Payload: система оповещения обязана работать и тогда,
 * когда Payload недоступен.
 */
export type AlertingSettings = {
	/** Письма об ошибках включены. */
	emailEnabled: boolean;
	/** Ниже этого уровня письма не уходят вовсе. */
	severityThreshold: Severity;
	/** Первая пауза после первой отправки, секунд. */
	cooldownBaseSeconds: number;
	/** Потолок паузы, секунд. */
	cooldownMaxSeconds: number;
	/** Тишина такой длины сбрасывает отпечаток в состояние «новый». */
	cooldownResetSeconds: number;
	/** Потолок писем в час на весь стенд, по всем отпечаткам. */
	maxMessagesPerHour: number;
	/** Прерывать ли паузу на 100-м, 1000-м, … повторе. */
	burstEscalation: boolean;
	warnings: {
		enabled: boolean;
		/** Префиксы модулей. Пустой список при `enabled` — «все». */
		allowedModules: string[];
	};
	/** Суточная сводка — сигнал «я жив». */
	dailyDigest: boolean;
};

/**
 * Рабочая конфигурация на чистой базе: ошибки и падения доходят,
 * предупреждения — нет, поток ограничен двадцатью письмами в час.
 */
export const DEFAULT_ALERTING_SETTINGS: AlertingSettings = {
	emailEnabled: true,
	severityThreshold: "error",
	cooldownBaseSeconds: 60,
	cooldownMaxSeconds: 6 * 60 * 60,
	cooldownResetSeconds: 6 * 60 * 60,
	maxMessagesPerHour: 20,
	burstEscalation: true,
	warnings: { enabled: false, allowedModules: [] },
	dailyDigest: true,
};

export function defaultSeverity(source: ErrorSource): Severity {
	return source === "process" ? "fatal" : "error";
}

export function meetsThreshold(
	severity: Severity,
	threshold: Severity,
): boolean {
	return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

export function isSeverity(value: unknown): value is Severity {
	return value === "warning" || value === "error" || value === "fatal";
}
