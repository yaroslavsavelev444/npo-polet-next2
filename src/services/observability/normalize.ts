import { mapFrame } from "./source-maps.ts";
import type { NormalizedError, StackFrame } from "./types.ts";

// Приведение брошенного значения к разбираемому виду.
//
// ─── Зачем очищать сообщение ────────────────────────────────────────────────
//
// Текст ошибки — не нейтральная техническая информация. Персональные данные
// попадают в него не потому, что кто-то их туда положил, а потому что так
// устроены библиотеки этого проекта:
//
//  * Drizzle (под Payload) бросает `Failed query: insert into "orders" …
//    params: Иван,+79161234567,ivan@mail.ru,…` — ПАРАМЕТРЫ ЗАПРОСА ЦЕЛИКОМ;
//  * Postgres в нарушении уникальности пишет `Key (email)=(ivan@mail.ru)
//    already exists` — само продублированное значение;
//  * nodemailer пишет адрес получателя, HTTP-клиенты — URL вместе с query.
//
// Поэтому наружу уходит шаблон: значения заменены плейсхолдерами, структура
// сохранена. `Key (email)=(<value>) already exists` отвечает на вопрос «что
// сломалось» так же хорошо, как оригинал, и не отвечает на вопрос «у кого».
// Оригинал остаётся в `rawMessage` и лежит только в журнале на сервере.

const MAX_MESSAGE_LENGTH = 600;

/** Глубина цепочки `cause`: «обёртка → драйвер → сокет». */
const MAX_CAUSE_DEPTH = 3;

const MAX_FRAMES = 12;

/**
 * Замены, в порядке применения. Порядок значим: структурные правила
 * Postgres/Drizzle — первыми, пока значения ещё стоят на своих местах; почта
 * — до кавычек, иначе адрес превратился бы в безликое `<str>`.
 */
const SCRUBBERS: readonly (readonly [RegExp, string])[] = [
	// Drizzle: всё после `params:` — значения запроса. Сам SQL параметризован
	// и значений не несёт, поэтому он остаётся: по нему видно, какая таблица.
	[/\bparams:[\s\S]*$/i, "params: <redacted>"],
	// Postgres: `Key (email, inn)=(ivan@mail.ru, 7707083893)`.
	[/\bKey \(([^)]*)\)=\((?:[^()]|\([^)]*\))*\)/g, "Key ($1)=(<value>)"],
	[/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>"],
	// JWT: три сегмента base64url, узнаётся по префиксу заголовка.
	[/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>"],
	// URL: схема и хост остаются — по ним видно, какой внешний сервис отказал.
	[/\b(https?:\/\/[^\s/"']+)(\/[^\s"']*)?/g, "$1/<path>"],
	// Строка подключения с паролем: `postgres://user:pass@host`.
	[/\b([a-z][\w+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1<credentials>@"],
	[/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g, "<addr>"],
	[
		/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
		"<id>",
	],
	// Длинный непрерывный токен: ключ, подпись, хеш.
	[/\b[A-Za-z0-9_-]{32,}\b/g, "<token>"],
	// Содержимое кавычек. Имена таблиц и индексов Postgres тоже в кавычках, но
	// они есть в сыром тексте, а в письме важнее не пропустить значение.
	[/"[^"]*"/g, "<str>"],
	[/'[^']*'/g, "<str>"],
	[/«[^»]*»/g, "<str>"],
	// Телефон, ИНН, ОГРН, номер заказа. Короткие числа (код ответа, порт,
	// номер попытки) нужны и никого не идентифицируют.
	[/\+?\d[\d\s()-]{8,}\d/g, "<num>"],
	[/\b\d{7,}\b/g, "<num>"],
];

/** Заменить значения плейсхолдерами, сохранив структуру сообщения. */
export function scrubMessage(value: string): string {
	let result = value;

	for (const [pattern, replacement] of SCRUBBERS) {
		result = result.replace(pattern, replacement);
	}

	// Многострочное сообщение драйвера в письме только рвёт таблицу фактов.
	result = result.replace(/\s+/g, " ").trim();

	return result.length > MAX_MESSAGE_LENGTH
		? `${result.slice(0, MAX_MESSAGE_LENGTH)}…`
		: result;
}

/**
 * Путь к файлу, укороченный до читаемого. Воркеры идут по исходникам и дают
 * настоящие пути `src/...`; веб-процесс собран Next и даёт `.next/server`.
 */
function shortenPath(raw: string): { file: string; vendor: boolean } {
	let file = raw;

	file = file.replace(/^file:\/\//, "");
	file = file.replace(/^webpack-internal:\/{3}\([^)]*\)\/\.?/, "");
	file = file.replace(/^webpack:\/{3}\.?/, "");
	file = file.replace(/^turbopack:\/{3}(?:\[project\]\/)?/, "");

	// Карты Turbopack отдают путь URL-кодированным: `app/%28frontend%29/…`.
	try {
		file = decodeURIComponent(file);
	} catch {
		// Битая последовательность — оставляем как есть.
	}

	const vendorIndex = file.lastIndexOf("node_modules/");
	if (vendorIndex >= 0) {
		return { file: file.slice(vendorIndex), vendor: true };
	}

	if (file.startsWith("node:")) return { file, vendor: true };

	for (const root of ["/src/", "/app/(", "/app/api/"]) {
		const index = file.lastIndexOf(root);
		if (index >= 0) return { file: file.slice(index + 1), vendor: false };
	}

	const nextIndex = file.lastIndexOf("/.next/");
	if (nextIndex >= 0) return { file: file.slice(nextIndex + 1), vendor: false };

	return { file, vendor: false };
}

const FRAME_WITH_NAME = /^\s*at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/;
const FRAME_BARE = /^\s*at\s+(?:async\s+)?(.+?):(\d+):(\d+)$/;

/**
 * Кадр из разобранной строки стека. Карта кода ищется ДО укорачивания пути и
 * по сырому абсолютному пути: она лежит рядом с файлом бандла, и обрезанный
 * `.next/server/chunks/…` её уже не найдёт.
 */
function toFrame(
	fn: string | undefined,
	rawFile: string,
	rawLine: number,
	rawColumn: number,
): StackFrame {
	const mapped = mapFrame(rawFile, rawLine, rawColumn);
	const source = mapped ?? { file: rawFile, line: rawLine, column: rawColumn };
	const { file, vendor } = shortenPath(source.file);

	return {
		...(fn ? { fn } : {}),
		file,
		line: source.line,
		column: source.column,
		vendor,
	};
}

/** Разобрать стек в кадры. Нераспознанные строки отбрасываются. */
export function parseStack(stack: string | undefined): StackFrame[] {
	if (!stack) return [];

	const frames: StackFrame[] = [];

	for (const line of stack.split("\n")) {
		const named = FRAME_WITH_NAME.exec(line);

		if (named?.[1] && named[2]) {
			frames.push(
				toFrame(named[1], named[2], Number(named[3]), Number(named[4])),
			);
			continue;
		}

		const bare = FRAME_BARE.exec(line);

		if (bare?.[1]) {
			frames.push(
				toFrame(undefined, bare[1], Number(bare[2]), Number(bare[3])),
			);
		}
	}

	return frames;
}

/**
 * Собственные кадры идут полностью; подряд идущие кадры библиотек
 * схлопываются в один — первый, он называет, какая библиотека бросила. Без
 * этого половина письма — `node_modules/drizzle-orm` и `node:internal`.
 */
export function selectFrames(
	frames: readonly StackFrame[],
	limit = MAX_FRAMES,
): StackFrame[] {
	const collapsed: StackFrame[] = [];
	let vendorRun = 0;

	for (const frame of frames) {
		if (frame.vendor) {
			vendorRun += 1;
			if (vendorRun === 1) collapsed.push(frame);
			continue;
		}

		vendorRun = 0;
		collapsed.push(frame);
	}

	return collapsed.slice(0, limit);
}

/** Строка кадра в том виде, в каком она попадает в письмо. */
export function formatFrame(frame: StackFrame): string {
	const where = frame.line ? `${frame.file}:${frame.line}` : frame.file;
	return frame.fn ? `at ${frame.fn} (${where})` : `at ${where}`;
}

/**
 * Машинный код: SQLSTATE Postgres (`23505`), коды Node (`ECONNREFUSED`),
 * числовые коды приводятся к виду `E<n>`.
 */
function extractCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;

	const code = (error as { code?: unknown }).code;

	if (typeof code === "string" && code.length > 0 && code.length <= 64) {
		return code;
	}

	if (typeof code === "number") return `E${code}`;

	return undefined;
}

function describe(value: unknown): { name: string; message: string } {
	if (value instanceof Error) {
		return { name: value.name || "Error", message: value.message };
	}

	if (typeof value === "string") return { name: "Thrown", message: value };

	if (typeof value === "object" && value !== null) {
		const message = (value as { message?: unknown }).message;
		const name = (value as { name?: unknown }).name;
		return {
			name: typeof name === "string" && name ? name : "NonError",
			message: typeof message === "string" ? message : safeStringify(value),
		};
	}

	return { name: "NonError", message: String(value) };
}

/** `JSON.stringify` не падает на циклах и на `BigInt`. */
function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return Object.prototype.toString.call(value);
	}
}

/** Цепочка `cause`: и сырая (для журнала), и очищенная (для письма). */
function collectCauses(error: unknown): {
	raw: { name: string; message: string }[];
	scrubbed: { name: string; message: string }[];
} {
	const raw: { name: string; message: string }[] = [];
	const seen = new Set<unknown>([error]);

	let current: unknown =
		typeof error === "object" && error !== null
			? (error as { cause?: unknown }).cause
			: undefined;

	while (current !== undefined && current !== null) {
		if (raw.length >= MAX_CAUSE_DEPTH || seen.has(current)) break;
		seen.add(current);

		raw.push(describe(current));

		current =
			typeof current === "object"
				? (current as { cause?: unknown }).cause
				: undefined;
	}

	return {
		raw,
		scrubbed: raw.map((cause) => ({
			name: cause.name,
			message: scrubMessage(cause.message),
		})),
	};
}

/**
 * Привести брошенное значение к `NormalizedError`.
 *
 * Принимает `unknown`, потому что `throw` принимает что угодно. Не бросает ни
 * при каком входе: функция стоит на пути обработки ошибки, и падение здесь
 * означало бы потерю исходной.
 */
export function normalizeError(error: unknown): NormalizedError {
	const { name, message } = describe(error);
	const stack = error instanceof Error ? error.stack : undefined;
	const causes = collectCauses(error);

	return {
		name,
		rawMessage: message,
		message: scrubMessage(message),
		code: extractCode(error),
		frames: selectFrames(parseStack(stack)),
		rawStack: stack,
		causes: causes.scrubbed,
		rawCauses: causes.raw,
	};
}
