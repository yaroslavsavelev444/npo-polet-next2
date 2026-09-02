import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Regression-тесты хеширования OTP (см. src/modules/auth/lib/otp.ts).
 *
 * PAYLOAD_SECRET здесь — «перец» хеша, поэтому его нужно задать ДО импорта
 * модуля: без секрета hashOtp намеренно бросает, чтобы отсутствие переменной
 * не превращалось в тихий пустой перец.
 *
 * Запуск: pnpm test:security
 */
process.env.PAYLOAD_SECRET ??= "test-secret-for-otp-hashing";

const { generateOtp, hashOtp, hashesEqual, verifyOtp } = await import(
	"../../src/modules/auth/lib/otp.ts"
);

test("код — 6 цифр", () => {
	for (let i = 0; i < 200; i++) {
		assert.match(generateOtp(), /^\d{6}$/);
	}
});

test("хеш зависит и от кода, и от пользователя", () => {
	// Соль = userId: одинаковый код у разных пользователей даёт разные хеши,
	// иначе хеш одного пользователя подходил бы другому.
	assert.notEqual(hashOtp("123456", "10"), hashOtp("123456", "11"));
	assert.notEqual(hashOtp("123456", "10"), hashOtp("123457", "10"));
	assert.equal(hashOtp("123456", "10"), hashOtp("123456", "10"));
});

test("сам код в хеше не восстановим и не хранится", () => {
	const hash = hashOtp("123456", "10");
	assert.match(hash, /^[0-9a-f]{64}$/);
	assert.equal(hash.includes("123456"), false);
});

test("hashesEqual сравнивает корректно и не падает на мусоре", () => {
	const a = hashOtp("123456", "10");
	assert.equal(hashesEqual(a, a), true);
	assert.equal(hashesEqual(a, hashOtp("654321", "10")), false);
	assert.equal(hashesEqual(a, ""), false);
	assert.equal(hashesEqual(a, "не-hex"), false);
	assert.equal(hashesEqual(a, `${a}00`), false);
	// Пустые входы не должны совпадать друг с другом (иначе пустой codeHash
	// в БД принимал бы любой код).
	assert.equal(hashesEqual("", ""), false);
});

test("verifyOtp принимает верный код и отвергает неверный", () => {
	const hash = hashOtp("123456", "10");
	assert.equal(verifyOtp("123456", "10", hash), true);
	assert.equal(verifyOtp("123457", "10", hash), false);
	assert.equal(verifyOtp("123456", "11", hash), false);
});
