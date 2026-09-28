import assert from "node:assert/strict";
import { test } from "node:test";
import { errorAlertEmailTemplate } from "../../src/services/email/templates/ops/error-alert.template.ts";
import { computeFingerprint } from "../../src/services/observability/fingerprint.ts";
import { normalizeError } from "../../src/services/observability/normalize.ts";
import {
	maskPath,
	toSafeAlert,
} from "../../src/services/observability/safe-payload.ts";
import type {
	AlertStats,
	CaptureContext,
	ErrorEvent,
} from "../../src/services/observability/types.ts";

/**
 * Граница персональных данных: всё, что уходит письмом, собирается белым
 * списком (safe-payload.ts). Фикстуры — ошибки в том виде, в каком их
 * действительно бросают библиотеки Polet, с настоящими по форме ПДн.
 * Ни одна подстрока из PD не имеет права дойти ни до SafeAlert, ни до
 * отрендеренного письма.
 *
 * Запуск: pnpm test:observability
 */

process.env.PAYLOAD_SECRET ??= "test-secret";

const PD = {
	name: "Иван Петров",
	email: "ivan.petrov@mail.ru",
	phone: "+79161234567",
	phoneFormatted: "+7 (916) 123-45-67",
	inn: "7707083893",
	address: "ул. Ленина, д. 5, кв. 12",
	ip: "203.0.113.45",
	userAgent: "Mozilla/5.0 (Macintosh) PersonalBrowser/1.0",
	userId: "4815",
	orderPath: "/orders/100245?token=abc",
	jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0ODE1In0.c2lnbmF0dXJlLXZhbHVl",
};

function drizzleError(): Error {
	const cause = Object.assign(
		new Error(
			`duplicate key value violates unique constraint "users_email_idx"`,
		),
		{
			code: "23505",
			detail: `Key (email)=(${PD.email}) already exists.`,
		},
	);
	const error = new Error(
		`Failed query: insert into "orders" ("full_name", "phone", "email", "inn", "address") values ($1, $2, $3, $4, $5)\nparams: ${PD.name},${PD.phone},${PD.email},${PD.inn},${PD.address}`,
		{ cause },
	);
	error.name = "DrizzleQueryError";
	return error;
}

const STATS: AlertStats = {
	occurrences: 3,
	firstSeen: new Date("2026-09-28T10:00:00Z"),
	lastSeen: new Date("2026-09-28T10:05:00Z"),
	suppressed: 1,
	sendCount: 2,
	trigger: "cooldown-expired",
	budgetExhausted: false,
	budgetSuppressed: 0,
	degraded: false,
};

function eventFor(error: unknown, context: CaptureContext): ErrorEvent {
	const normalized = normalizeError(error);
	return {
		errorId: "7d1c7e0e-8e2f-4b8a-9d5b-2f4a1b6c9e01",
		fingerprint: computeFingerprint(normalized, context),
		at: new Date("2026-09-28T10:05:00Z"),
		severity: "error",
		environment: "production",
		processName: "web",
		hostname: "polet-app",
		error: normalized,
		context,
	};
}

const CONTEXT: CaptureContext = {
	source: "action",
	module: "checkout",
	http: { method: "POST", path: PD.orderPath, status: 500 },
	job: {
		queue: "restock-notifications",
		name: "product",
		attempt: 2,
		maxAttempts: 3,
	},
	userId: PD.userId,
	ip: PD.ip,
	userAgent: PD.userAgent,
	extra: { email: PD.email, phone: PD.phoneFormatted, address: PD.address },
};

const FIXTURES: [string, unknown][] = [
	["Drizzle с параметрами запроса и причиной Postgres", drizzleError()],
	[
		"nodemailer с адресом получателя",
		Object.assign(
			new Error(
				`Can't send mail - all recipients were rejected: 550 5.1.1 <${PD.email}>: user unknown`,
			),
			{ responseCode: 550 },
		),
	],
	[
		"HTTP-клиент с URL и query",
		new Error(
			`fetch failed: https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party?query=${PD.inn}`,
		),
	],
	[
		"строка вместо Error",
		`Не найден пользователь ${PD.email} с телефоном ${PD.phoneFormatted}`,
	],
	["JWT в тексте", new Error(`jwt malformed: ${PD.jwt}`)],
	[
		"брошенный объект",
		{ name: `User ${PD.email}`, message: `phone ${PD.phone}`, code: PD.inn },
	],
];

for (const [label, error] of FIXTURES) {
	test(`письмо не несёт ПДн: ${label}`, () => {
		const alert = toSafeAlert(
			eventFor(error, CONTEXT),
			STATS,
			"https://npo-polet.ru/admin/collections/error-events/17",
		);
		const rendered = errorAlertEmailTemplate.render(alert);
		const outgoing = [
			JSON.stringify(alert),
			rendered.subject,
			rendered.html,
			rendered.text,
		].join("\n");

		for (const [key, value] of Object.entries(PD)) {
			assert.ok(!outgoing.includes(value), `в письмо попало ${key}: ${value}`);
		}
		// Сырые поля на месте — в журнале, не в письме.
		assert.ok(
			!("userId" in alert) && !("ip" in alert) && !("userAgent" in alert),
		);
	});
}

test("SafeAlert — ровно белый список полей", () => {
	const alert = toSafeAlert(eventFor(drizzleError(), CONTEXT), STATS);
	assert.deepEqual(Object.keys(alert).sort(), [
		"at",
		"causes",
		"code",
		"environment",
		"errorId",
		"errorName",
		"fingerprint",
		"frames",
		"hostname",
		"http",
		"job",
		"message",
		"module",
		"processName",
		"severity",
		"source",
		"stats",
		"userRef",
	]);
	assert.deepEqual(Object.keys(alert.http ?? {}).sort(), [
		"method",
		"route",
		"status",
	]);
});

test("вместо пользователя — устойчивый псевдоним", () => {
	const a = toSafeAlert(eventFor(new Error("x"), CONTEXT), STATS);
	const b = toSafeAlert(eventFor(new Error("y"), CONTEXT), STATS);
	const other = toSafeAlert(
		eventFor(new Error("x"), { ...CONTEXT, userId: "4816" }),
		STATS,
	);
	assert.match(a.userRef ?? "", /^u:[0-9a-f]{8}$/);
	assert.equal(a.userRef, b.userRef);
	assert.notEqual(a.userRef, other.userRef);
});

test("путь без шаблона маскируется, query отбрасывается", () => {
	assert.equal(maskPath("/orders/100245?token=abc"), "/orders/[value]");
	assert.equal(
		maskPath("/api/notifications/7d1c7e0e-8e2f-4b8a-9d5b-2f4a1b6c9e01"),
		"/api/notifications/[value]",
	);
	assert.equal(
		maskPath("/category/drony/products/kvadrokopter"),
		"/category/drony/products/kvadrokopter",
	);
});

test("письмо экранирует HTML из текста ошибки", () => {
	const alert = toSafeAlert(
		eventFor(new Error("<script>alert(1)</script>"), CONTEXT),
		STATS,
	);
	const { html } = errorAlertEmailTemplate.render(alert);
	assert.ok(!html.includes("<script>"));
});
