import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
	__resetEmailConfigCacheForTests,
	getEmailConfig,
} from "../../src/services/email/config.ts";
import {
	type FailoverState,
	isRelayFailure,
	PRIMARY_COOLDOWN_MS,
	type SmtpRoute,
	sendWithFailover,
} from "../../src/services/email/failover.ts";

/**
 * Переключение на запасной SMTP (src/services/email/failover.ts) и разбор его
 * настроек. Ошибки — в том виде, в каком их отдаёт nodemailer: первая взята
 * дословно из журнала прода, когда Яндекс отбивал соединения с сервера.
 *
 * Запуск: pnpm test:email
 */

const refused = Object.assign(
	new Error("connect ECONNREFUSED 77.88.21.158:465"),
	{ code: "ESOCKET", command: "CONN", errno: -111, syscall: "connect" },
);

const noSuchMailbox = Object.assign(new Error("550 5.7.1 No such user"), {
	code: "EENVELOPE",
	command: "RCPT TO",
	responseCode: 550,
});

const silentLog = { warn() {}, info() {} };

function route(name: SmtpRoute<string>["name"], from: string, fails?: unknown) {
	const calls: Record<string, unknown>[] = [];
	return {
		calls,
		route: {
			name,
			from,
			mailer: {
				async sendMail(mail: Record<string, unknown>) {
					calls.push(mail);
					if (fails) throw fails;
					return `${name}-id`;
				},
			},
		} satisfies SmtpRoute<string>,
	};
}

const mail = { to: "user@example.com", subject: "Код", text: "123456" };

describe("isRelayFailure", () => {
	for (const [label, error] of [
		["отбитое соединение", refused],
		["таймаут", { code: "ETIMEDOUT" }],
		["TLS", { code: "ETLS" }],
		["неверный логин", { code: "EAUTH", responseCode: 535 }],
		["блок на приветствии", { command: "CONN", responseCode: 554 }],
		["421", { responseCode: 421 }],
	] as const) {
		test(`${label} — сбой сервера`, () => {
			assert.equal(isRelayFailure(error), true);
		});
	}

	for (const [label, error] of [
		["отказ по адресу", noSuchMailbox],
		["отказ по письму", { code: "EMESSAGE", responseCode: 554 }],
		["обычная ошибка", new Error("boom")],
		["не объект", "ECONNREFUSED"],
	] as const) {
		test(`${label} — не сбой сервера`, () => {
			assert.equal(isRelayFailure(error), false);
		});
	}
});

describe("sendWithFailover", () => {
	test("работающий основной — запасной не трогается", async () => {
		const primary = route("primary", "a@npo-polet.ru");
		const fallback = route("fallback", "b@mail.ru");

		const id = await sendWithFailover(
			mail,
			{ primary: primary.route, fallback: fallback.route },
			{ primaryDownUntil: 0 },
			silentLog,
		);

		assert.equal(id, "primary-id");
		assert.deepEqual(primary.calls, [{ ...mail, from: "a@npo-polet.ru" }]);
		assert.equal(fallback.calls.length, 0);
	});

	test("основной отбил соединение — письмо уходит через запасной", async () => {
		const primary = route("primary", "a@npo-polet.ru", refused);
		const fallback = route("fallback", "b@mail.ru");
		const state: FailoverState = { primaryDownUntil: 0 };

		const id = await sendWithFailover(
			mail,
			{ primary: primary.route, fallback: fallback.route },
			state,
			silentLog,
			() => 1000,
		);

		assert.equal(id, "fallback-id");
		assert.deepEqual(fallback.calls, [
			{ ...mail, from: "b@mail.ru", replyTo: "a@npo-polet.ru" },
		]);
		assert.equal(state.primaryDownUntil, 1000 + PRIMARY_COOLDOWN_MS);
	});

	test("свой Reply-To у письма сохраняется", async () => {
		const primary = route("primary", "a@npo-polet.ru", refused);
		const fallback = route("fallback", "b@mail.ru");

		await sendWithFailover(
			{ ...mail, replyTo: "client@example.com" },
			{ primary: primary.route, fallback: fallback.route },
			{ primaryDownUntil: 0 },
			silentLog,
		);

		assert.equal(fallback.calls[0]?.replyTo, "client@example.com");
	});

	test("отклонённое основным письмо не переотправляется", async () => {
		const primary = route("primary", "a@npo-polet.ru", noSuchMailbox);
		const fallback = route("fallback", "b@mail.ru");
		const state: FailoverState = { primaryDownUntil: 0 };

		await assert.rejects(
			sendWithFailover(
				mail,
				{ primary: primary.route, fallback: fallback.route },
				state,
				silentLog,
			),
			(error) => error === noSuchMailbox,
		);
		assert.equal(fallback.calls.length, 0);
		assert.equal(state.primaryDownUntil, 0);
	});

	test("пока основной остывает — сразу запасной", async () => {
		const primary = route("primary", "a@npo-polet.ru");
		const fallback = route("fallback", "b@mail.ru");

		await sendWithFailover(
			mail,
			{ primary: primary.route, fallback: fallback.route },
			{ primaryDownUntil: 5000 },
			silentLog,
			() => 4000,
		);

		assert.equal(primary.calls.length, 0);
		assert.equal(fallback.calls.length, 1);
	});

	test("после остывания основной снова первый, и метка снимается", async () => {
		const primary = route("primary", "a@npo-polet.ru");
		const fallback = route("fallback", "b@mail.ru");
		const state: FailoverState = { primaryDownUntil: 5000 };

		await sendWithFailover(
			mail,
			{ primary: primary.route, fallback: fallback.route },
			state,
			silentLog,
			() => 6000,
		);

		assert.equal(primary.calls.length, 1);
		assert.equal(fallback.calls.length, 0);
		assert.equal(state.primaryDownUntil, 0);
	});

	test("запасной упал во время остывания — пробуем основной", async () => {
		const primary = route("primary", "a@npo-polet.ru");
		const fallback = route("fallback", "b@mail.ru", { code: "ETIMEDOUT" });

		const id = await sendWithFailover(
			mail,
			{ primary: primary.route, fallback: fallback.route },
			{ primaryDownUntil: 5000 },
			silentLog,
			() => 4000,
		);

		assert.equal(id, "primary-id");
	});

	test("оба недоступны — последняя ошибка наружу", async () => {
		const backupDown = { code: "ECONNECTION" };
		const primary = route("primary", "a@npo-polet.ru", refused);
		const fallback = route("fallback", "b@mail.ru", backupDown);

		await assert.rejects(
			sendWithFailover(
				mail,
				{ primary: primary.route, fallback: fallback.route },
				{ primaryDownUntil: 0 },
				silentLog,
			),
			(error) => error === backupDown,
		);
	});

	test("без запасного — поведение как раньше", async () => {
		const primary = route("primary", "a@npo-polet.ru", refused);

		await assert.rejects(
			sendWithFailover(
				mail,
				{ primary: primary.route, fallback: null },
				{ primaryDownUntil: 0 },
				silentLog,
			),
			(error) => error === refused,
		);
		assert.equal(primary.calls.length, 1);
	});
});

describe("настройки запасного SMTP", () => {
	const base = {
		SMTP_HOST: "smtp.yandex.ru",
		SMTP_PORT: "465",
		SMTP_USER: "info@npo-polet.ru",
		SMTP_PASSWORD: "x",
		EMAIL_FROM_ADDRESS: "info@npo-polet.ru",
	};
	const saved = { ...process.env };

	function configWith(env: Record<string, string>) {
		for (const key of Object.keys(process.env)) {
			if (/^(SMTP|EMAIL)_/.test(key)) delete process.env[key];
		}
		Object.assign(process.env, base, env);
		__resetEmailConfigCacheForTests();
		return getEmailConfig();
	}

	afterEach(() => {
		process.env = { ...saved };
		__resetEmailConfigCacheForTests();
	});

	test("пустые переменные из .env — запасной выключен", () => {
		const config = configWith({
			SMTP_FALLBACK_HOST: "",
			SMTP_FALLBACK_PORT: "",
			EMAIL_FALLBACK_FROM_ADDRESS: "",
		});
		assert.equal(config.fallback, null);
	});

	test("полный набор — порт 465 значит implicit TLS, отправитель — логин", () => {
		const config = configWith({
			SMTP_FALLBACK_HOST: "smtp.mail.ru",
			SMTP_FALLBACK_PORT: "465",
			SMTP_FALLBACK_USER: "polet@mail.ru",
			SMTP_FALLBACK_PASSWORD: "y",
		});
		assert.deepEqual(config.fallback, {
			host: "smtp.mail.ru",
			port: 465,
			secure: true,
			user: "polet@mail.ru",
			password: "y",
			fromAddress: "polet@mail.ru",
		});
	});

	test("хост без пароля — ошибка сразу, а не во время аварии", () => {
		assert.throws(
			() =>
				configWith({
					SMTP_FALLBACK_HOST: "smtp.mail.ru",
					SMTP_FALLBACK_USER: "polet@mail.ru",
				}),
			/SMTP_FALLBACK_PASSWORD/,
		);
	});
});
