import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFingerprint } from "../../src/services/observability/fingerprint.ts";
import {
	isClientFault,
	normalizeError,
	parseStack,
	scrubMessage,
	selectFrames,
} from "../../src/services/observability/normalize.ts";

/** Запуск: pnpm test:observability */

test("Drizzle: параметры запроса вырезаются, SQL остаётся", () => {
	const scrubbed = scrubMessage(
		'Failed query: select "id" from "users" where "email" = $1\nparams: ivan@mail.ru',
	);
	assert.match(scrubbed, /from <str> where <str> = \$1 params: <redacted>$/);
});

test("Postgres: значение в Key (...)=(...) заменяется, имя колонки остаётся", () => {
	assert.equal(
		scrubMessage("Key (inn, kpp)=(7707083893, 770701001) already exists."),
		"Key (inn, kpp)=(<value>) already exists.",
	);
});

test("хост внешнего сервиса остаётся, путь и query — нет", () => {
	assert.equal(
		scrubMessage(
			"connect ECONNREFUSED https://suggestions.dadata.ru/api/party?query=7707083893",
		),
		"connect ECONNREFUSED https://suggestions.dadata.ru/<path>",
	);
});

test("пароль в строке подключения вырезается", () => {
	const scrubbed = scrubMessage(
		"connect failed postgres://npo_user:s3cr3t@postgres:5432/npo_polet",
	);
	assert.ok(!scrubbed.includes("s3cr3t"));
	assert.ok(!scrubbed.includes("npo_user"));
});

test("короткие числа — код ответа, порт, попытка — сохраняются", () => {
	assert.equal(
		scrubMessage("HTTP 503 after attempt 3"),
		"HTTP 503 after attempt 3",
	);
});

test("телефон в любом формате заменяется", () => {
	assert.equal(
		scrubMessage("sms to +7 (916) 123-45-67 failed"),
		"sms to <num> failed",
	);
	assert.equal(
		scrubMessage("sms to 89161234567 failed"),
		"sms to <num> failed",
	);
});

test("нормализация не бросает на любом входе", () => {
	const cyclic: Record<string, unknown> = {};
	cyclic.self = cyclic;
	cyclic.cause = cyclic;
	for (const value of [
		undefined,
		null,
		42,
		"text",
		cyclic,
		Symbol("s"),
		BigInt(10),
	]) {
		const result = normalizeError(value);
		assert.equal(typeof result.message, "string");
	}
});

test("исходный текст сохраняется для журнала, причины — тоже", () => {
	const error = new Error("outer ivan@mail.ru", {
		cause: new Error("inner +79161234567"),
	});
	const normalized = normalizeError(error);
	assert.equal(normalized.rawMessage, "outer ivan@mail.ru");
	assert.equal(normalized.message, "outer <email>");
	assert.deepEqual(normalized.rawCauses, [
		{ name: "Error", message: "inner +79161234567" },
	]);
	assert.deepEqual(normalized.causes, [
		{ name: "Error", message: "inner <num>" },
	]);
});

test("кадры библиотек подряд схлопываются в один", () => {
	const frames = selectFrames(
		parseStack(
			[
				"Error: boom",
				"    at createOrder (/app/src/payload/services/orders.service.ts:10:5)",
				"    at query (/app/node_modules/drizzle-orm/pg-core/session.js:1:1)",
				"    at run (/app/node_modules/drizzle-orm/pg-core/session.js:2:1)",
				"    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
				"    at checkoutAction (/app/src/modules/checkout/actions/checkout.actions.ts:200:3)",
			].join("\n"),
		),
	);
	assert.deepEqual(
		frames.map((f) => `${f.file}#${f.fn}`),
		[
			"src/payload/services/orders.service.ts#createOrder",
			"node_modules/drizzle-orm/pg-core/session.js#query",
			"src/modules/checkout/actions/checkout.actions.ts#checkoutAction",
		],
	);
});

function errorWith(message: string, line: number): Error {
	const error = new Error(message);
	error.stack = `Error: ${message}\n    at createOrder (/app/src/payload/services/orders.service.ts:${line}:5)`;
	return error;
}

test("отпечаток не зависит от номера строки и от значений в тексте", () => {
	const context = { source: "action" as const, module: "checkout" };
	const a = computeFingerprint(
		normalizeError(errorWith("dup ivan@mail.ru", 10)),
		context,
	);
	const b = computeFingerprint(
		normalizeError(errorWith("dup olga@yandex.ru", 42)),
		context,
	);
	const other = computeFingerprint(
		normalizeError(errorWith("timeout", 10)),
		context,
	);
	assert.equal(a, b);
	assert.notEqual(a, other);
});

test("URL-кодированный путь из карты Turbopack укорачивается до корня", () => {
	const [frame] = parseStack(
		"Error: x\n    at Page (/srv/app/%28frontend%29/orders/%5BorderNumber%5D/page.tsx:4:9)",
	);
	assert.equal(frame?.file, "app/(frontend)/orders/[orderNumber]/page.tsx");
});

test("битое тело запроса и 4xx — вина клиента, а не сбой сайта", () => {
	// Ровно та ошибка, что пришла с прода на POST / от сканера.
	assert.equal(
		isClientFault(new TypeError("Failed to parse body as FormData.")),
		true,
	);
	assert.equal(
		isClientFault(Object.assign(new Error("x"), { status: 403 })),
		true,
	);
	assert.equal(
		isClientFault(Object.assign(new Error("x"), { status: 500 })),
		false,
	);
	assert.equal(
		isClientFault(new TypeError("Cannot read properties of undefined")),
		false,
	);
});

test("форма устаревшей версии сайта — не сбой", () => {
	assert.equal(
		isClientFault(
			new Error(
				"Failed to find Server Action. This request might be from an older or newer deployment.",
			),
		),
		true,
	);
});
