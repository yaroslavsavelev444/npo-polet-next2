import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceFingerprint } from "../../src/modules/auth/lib/network.ts";
import { TRUSTED_DEVICE_ROTATION_GRACE_MS } from "../../src/modules/auth/lib/trustedDevice.db.ts";
import {
	decideTrust,
	type TrustAttempt,
	type TrustedDeviceSnapshot,
} from "../../src/modules/auth/lib/trustedDevice.policy.ts";

/**
 * Когда вход проходит БЕЗ второго фактора, а когда нет.
 *
 * Здесь проверяется самое опасное правило механизма доверенных устройств, и
 * почти ни одна его ветка не воспроизводится в браузере: чтобы увидеть смену
 * подсети, нужно физически сменить сеть, а чтобы увидеть повторное
 * использование секрета — иметь копию чужой cookie. Ровно за этим правило и
 * вынесено в чистую функцию (см. trustedDevice.policy.ts).
 *
 * Запуск: pnpm test:security
 */

const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const LABEL = "Mac";
const NOW = new Date("2026-09-22T12:00:00.000Z");

const HASH_CURRENT = "a".repeat(64);
const HASH_PREVIOUS = "b".repeat(64);
const HASH_FOREIGN = "c".repeat(64);

function device(
	overrides: Partial<TrustedDeviceSnapshot> = {},
): TrustedDeviceSnapshot {
	return {
		userId: "7",
		tokenHash: HASH_CURRENT,
		previousTokenHash: HASH_PREVIOUS,
		rotatedAt: new Date(NOW.getTime() - 5_000).toISOString(),
		fingerprint: deviceFingerprint(LABEL, UA),
		ipPrefix: "v4:192.0.2.0/24",
		expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
		revoked: false,
		...overrides,
	};
}

function attempt(overrides: Partial<TrustAttempt> = {}): TrustAttempt {
	return {
		userId: "7",
		presentedTokenHash: HASH_CURRENT,
		ip: "192.0.2.17",
		userAgent: UA,
		deviceLabel: LABEL,
		now: NOW,
		...overrides,
	};
}

// ─── Счастливый путь ────────────────────────────────────────────────────────

test("свой браузер, своя сеть, текущий секрет — код не нужен", () => {
	assert.deepEqual(decideTrust(device(), attempt()), { trusted: true });
});

test("другой адрес внутри той же подсети доверие сохраняет", () => {
	// Адрес у домашнего провайдера меняется при каждой переподключке. Требуй
	// мы точного совпадения, механизм не работал бы почти ни у кого.
	assert.deepEqual(decideTrust(device(), attempt({ ip: "192.0.2.200" })), {
		trusted: true,
	});
});

// ─── Требование: новое устройство ───────────────────────────────────────────

test("другой браузер на той же машине — код нужен", () => {
	const edge = `${UA} Edg/141.0.0.0`;
	const verdict = decideTrust(device(), attempt({ userAgent: edge }));
	assert.deepEqual(verdict, {
		trusted: false,
		reason: "fingerprint_changed",
	});
});

test("тот же браузер на другом типе устройства — код нужен", () => {
	const verdict = decideTrust(
		device(),
		attempt({ deviceLabel: "Android телефон" }),
	);
	assert.equal(verdict.trusted, false);
});

// ─── Требование: смена подсети ──────────────────────────────────────────────

test("другая подсеть — код нужен, но доверие НЕ снимается", () => {
	const verdict = decideTrust(device(), attempt({ ip: "203.0.113.17" }));
	assert.deepEqual(verdict, { trusted: false, reason: "network_changed" });
	// Переезд в другую сеть — обычное дело (офис, мобильный интернет). Снимать
	// за это доверие значило бы заставлять подтверждать устройство заново после
	// каждой поездки.
	assert.ok(!("revokeAll" in verdict && verdict.revokeAll));
	assert.ok(!("dropCookie" in verdict && verdict.dropCookie));
});

test("неизвестный адрес — код нужен (отказ закрытый)", () => {
	const verdict = decideTrust(device(), attempt({ ip: "unknown" }));
	assert.deepEqual(verdict, { trusted: false, reason: "network_changed" });
});

test("устройство без записанной подсети доверия не даёт", () => {
	const verdict = decideTrust(device({ ipPrefix: null }), attempt());
	assert.deepEqual(verdict, { trusted: false, reason: "network_changed" });
});

test("неизвестный адрес при устройстве без подсети — тоже отказ", () => {
	// Два «не знаю» не равны друг другу: null-префикс не должен совпасть с
	// null-подсетью записи.
	const verdict = decideTrust(
		device({ ipPrefix: null }),
		attempt({ ip: "unknown" }),
	);
	assert.deepEqual(verdict, { trusted: false, reason: "network_changed" });
});

// ─── Требование: смена пароля и отзыв ───────────────────────────────────────

test("отозванное доверие (смена пароля, выход со всех устройств) — код нужен", () => {
	const verdict = decideTrust(device({ revoked: true }), attempt());
	assert.deepEqual(verdict, {
		trusted: false,
		reason: "revoked",
		dropCookie: true,
	});
});

test("истёкшее доверие — код нужен", () => {
	const verdict = decideTrust(
		device({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
		attempt(),
	);
	assert.deepEqual(verdict, {
		trusted: false,
		reason: "expired",
		dropCookie: true,
	});
});

test("доверие, истекающее ровно сейчас, уже не действует", () => {
	const verdict = decideTrust(
		device({ expiresAt: NOW.toISOString() }),
		attempt(),
	);
	assert.equal(verdict.trusted, false);
	assert.ok(!verdict.trusted && verdict.reason === "expired");
});

// ─── Чужой аккаунт ──────────────────────────────────────────────────────────

test("cookie другого аккаунта на общем компьютере — код нужен, но это не кража", () => {
	const verdict = decideTrust(device({ userId: "8" }), attempt());
	assert.deepEqual(verdict, { trusted: false, reason: "other_user" });
	// Ни отзыва, ни удаления cookie: она принадлежит другому аккаунту и
	// понадобится ему при следующем входе.
	assert.ok(!("revokeAll" in verdict && verdict.revokeAll));
	assert.ok(!("dropCookie" in verdict && verdict.dropCookie));
});

// ─── Ротация секрета ────────────────────────────────────────────────────────

test("прошлый секрет в окне ротации принимается (гонка двух вкладок)", () => {
	const verdict = decideTrust(
		device(),
		attempt({ presentedTokenHash: HASH_PREVIOUS }),
	);
	assert.deepEqual(verdict, { trusted: true });
});

test("прошлый секрет ЗА окном ротации — подозрение на кражу", () => {
	const verdict = decideTrust(
		device({
			rotatedAt: new Date(
				NOW.getTime() - TRUSTED_DEVICE_ROTATION_GRACE_MS - 1_000,
			).toISOString(),
		}),
		attempt({ presentedTokenHash: HASH_PREVIOUS }),
	);
	assert.deepEqual(verdict, {
		trusted: false,
		reason: "secret_reused",
		revokeAll: true,
		dropCookie: true,
	});
});

test("незнакомый секрет — подозрение на кражу", () => {
	const verdict = decideTrust(
		device(),
		attempt({ presentedTokenHash: HASH_FOREIGN }),
	);
	assert.equal(verdict.trusted, false);
	assert.ok("revokeAll" in verdict && verdict.revokeAll === true);
});

test("кража проверяется РАНЬШЕ сети и браузера", () => {
	// Порядок проверок значим: будь сеть первой, украденная cookie,
	// предъявленная из другой сети, выглядела бы как обычный переезд, и защита
	// от повторного использования секрета не сработала бы вовсе.
	const verdict = decideTrust(
		device(),
		attempt({
			presentedTokenHash: HASH_FOREIGN,
			ip: "203.0.113.17",
			userAgent: `${UA} Edg/141.0.0.0`,
		}),
	);
	assert.deepEqual(verdict, {
		trusted: false,
		reason: "secret_reused",
		revokeAll: true,
		dropCookie: true,
	});
});

test("отзыв проверяется раньше всего остального", () => {
	// Отозванная запись не должна попадать ни в одну другую ветку — в том числе
	// в ветку кражи: после «выйти со всех устройств» старый секрет в браузере
	// остаётся штатно, и трактовать его как кражу было бы ложной тревогой.
	const verdict = decideTrust(
		device({ revoked: true }),
		attempt({ presentedTokenHash: HASH_FOREIGN, ip: "203.0.113.17" }),
	);
	assert.equal(verdict.trusted, false);
	assert.equal("reason" in verdict ? verdict.reason : null, "revoked");
	assert.ok(!("revokeAll" in verdict && verdict.revokeAll));
});

test("прошлый секрет ровно на границе окна ротации ещё принимается", () => {
	const verdict = decideTrust(
		device({
			rotatedAt: new Date(
				NOW.getTime() - TRUSTED_DEVICE_ROTATION_GRACE_MS,
			).toISOString(),
		}),
		attempt({ presentedTokenHash: HASH_PREVIOUS }),
	);
	assert.deepEqual(verdict, { trusted: true });
});

test("прошлый секрет без известного времени ротации — подозрение на кражу", () => {
	// Отказ закрытый: окно без точки отсчёта не считается открытым.
	for (const rotatedAt of [null, "не дата"]) {
		const verdict = decideTrust(
			device({ rotatedAt }),
			attempt({ presentedTokenHash: HASH_PREVIOUS }),
		);
		assert.equal(verdict.trusted, false, `rotatedAt=${rotatedAt}`);
		assert.ok(
			!verdict.trusted && verdict.reason === "secret_reused",
			`rotatedAt=${rotatedAt}`,
		);
	}
});

// ─── Отсутствие ротации ─────────────────────────────────────────────────────

test("свежая запись без прошлого секрета принимает только текущий", () => {
	const fresh = device({ previousTokenHash: null, rotatedAt: null });
	assert.deepEqual(decideTrust(fresh, attempt()), { trusted: true });

	const verdict = decideTrust(
		fresh,
		attempt({ presentedTokenHash: HASH_PREVIOUS }),
	);
	assert.equal(verdict.trusted, false);
	assert.ok("revokeAll" in verdict && verdict.revokeAll === true);
});
