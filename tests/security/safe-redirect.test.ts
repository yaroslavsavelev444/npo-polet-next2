import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSafeRedirect } from "../../src/modules/auth/lib/safeRedirect.ts";

/**
 * Regression-тесты границы open redirect (см. safeRedirect.ts и proxy.ts).
 *
 * Запуск: pnpm test:security
 */

const ORIGIN = "https://npo-polet.ru";
const GUEST_PATHS = ["/auth/login", "/auth/register", "/auth/verify-otp"];

function resolve(from: string | null) {
	return resolveSafeRedirect(from, {
		origin: ORIGIN,
		fallback: "/profile",
		isDisallowedTarget: (pathname) =>
			GUEST_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
	});
}

test("возвращает внутренний путь как есть", () => {
	assert.equal(resolve("/orders"), "/orders");
	assert.equal(resolve("/orders/2026-000123"), "/orders/2026-000123");
	assert.equal(resolve("/category/nasosy?page=2"), "/category/nasosy?page=2");
});

test("отбрасывает абсолютные и protocol-relative адреса", () => {
	assert.equal(resolve("https://evil.com"), "/profile");
	assert.equal(resolve("http://evil.com/x"), "/profile");
	assert.equal(resolve("//evil.com"), "/profile");
	assert.equal(resolve("///evil.com"), "/profile");
});

test("обратный слэш не превращается в переход на чужой домен", () => {
	// Ровно тот обход, который проходил проверку «начинается с / и не с //»:
	// URL-парсер трактует \ как / и резолвит это в https://evil.com/.
	assert.equal(new URL("/\\evil.com", ORIGIN).origin, "https://evil.com");
	assert.equal(resolve("/\\evil.com"), "/profile");
	assert.equal(resolve("/\\/evil.com"), "/profile");
	assert.equal(resolve("/\\\\evil.com"), "/profile");
	assert.equal(resolve("\\/evil.com"), "/profile");
});

test("отбрасывает управляющие символы (инъекция в Location)", () => {
	assert.equal(resolve("/orders\r\nSet-Cookie: a=b"), "/profile");
	assert.equal(resolve("/orders\n"), "/profile");
	assert.equal(resolve("/orders\u0000"), "/profile");
	assert.equal(resolve("/orders\u007f"), "/profile");
	// Хвостовой пробел URL-парсер срезает сам — остаётся безопасный путь.
	assert.equal(resolve("/orders "), "/orders");
});

test("не возвращает на гостевые/OTP пути (петля переадресаций)", () => {
	assert.equal(resolve("/auth/login"), "/profile");
	assert.equal(resolve("/auth/verify-otp"), "/profile");
	assert.equal(resolve("/auth/login/extra"), "/profile");
});

test("пустое значение даёт fallback", () => {
	assert.equal(resolve(null), "/profile");
	assert.equal(resolve(""), "/profile");
});

test("схемы вроде javascript: не проходят", () => {
	assert.equal(resolve("javascript:alert(1)"), "/profile");
	assert.equal(resolve("data:text/html,<script>alert(1)</script>"), "/profile");
});
