import assert from "node:assert/strict";
import { test } from "node:test";
import {
	browserFamily,
	deviceFingerprint,
	networkPrefix,
	sameNetwork,
} from "../../src/modules/auth/lib/network.ts";

/**
 * Границы доверенного устройства: «та же сеть» и «тот же браузер».
 *
 * Эти два предиката — единственное, что отделяет вход без второго фактора от
 * входа с чужой машины или из чужой сети (см. modules/auth/lib/trustedDevice.ts).
 * Ошибка в любую сторону дорога: слишком строгий предикат заставляет вводить
 * код при каждом входе и обесценивает механизм, слишком мягкий — пускает без
 * кода того, кому cookie не выдавалась.
 *
 * Запуск: pnpm test:security
 */

// ─── IPv4 ───────────────────────────────────────────────────────────────────

test("IPv4 сводится к /24", () => {
	assert.equal(networkPrefix("192.0.2.17"), "v4:192.0.2.0/24");
	assert.equal(networkPrefix("192.0.2.200"), "v4:192.0.2.0/24");
});

test("смена адреса внутри /24 сеть не меняет", () => {
	assert.ok(sameNetwork("192.0.2.17", "192.0.2.200"));
});

test("соседняя /24 — уже другая сеть", () => {
	assert.ok(!sameNetwork("192.0.2.17", "192.0.3.17"));
	assert.ok(!sameNetwork("192.0.2.17", "203.0.113.17"));
});

test("IPv4-mapped IPv6 — та же сеть, что и сам IPv4", () => {
	// Один и тот же клиент за разными слоями прокси не должен выглядеть как
	// два разных: иначе доверие слетало бы при смене маршрута до приложения.
	assert.equal(networkPrefix("::ffff:192.0.2.17"), "v4:192.0.2.0/24");
	assert.ok(sameNetwork("::ffff:192.0.2.17", "192.0.2.99"));
});

// ─── IPv6 ───────────────────────────────────────────────────────────────────

test("IPv6 сводится к /64", () => {
	assert.equal(
		networkPrefix("2001:0db8:0000:0042:0000:8a2e:0370:7334"),
		"v6:2001:db8:0:42::/64",
	);
});

test("ротация приватного адреса (RFC 4941) сеть не меняет", () => {
	// Расширения приватности перебирают младшие 64 бита несколько раз в сутки.
	// Сравнение по полному адресу здесь ломало бы доверие ежедневно.
	assert.ok(
		sameNetwork(
			"2001:db8:0:42:1111:2222:3333:4444",
			"2001:db8:0:42:aaaa:bbbb:cccc:dddd",
		),
	);
});

test("сжатая и полная записи одного адреса дают одну сеть", () => {
	assert.ok(sameNetwork("2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:1"));
});

test("другой /64 — другая сеть", () => {
	assert.ok(!sameNetwork("2001:db8:0:42::1", "2001:db8:0:43::1"));
});

test("зона интерфейса на адресацию не влияет", () => {
	assert.equal(networkPrefix("fe80::1%eth0"), networkPrefix("fe80::1"));
});

test("сжатие :: в начале, в конце и внутри первых 64 бит", () => {
	assert.equal(networkPrefix("::1"), "v6:0:0:0:0::/64");
	assert.equal(networkPrefix("2001:db8::"), "v6:2001:db8:0:0::/64");
	// Хвост после :: достаёт до четвёртой группы — она входит в префикс.
	assert.equal(networkPrefix("2001:db8::42:0:0:0:1"), "v6:2001:db8:0:42::/64");
	// :: может заменять и одну-единственную группу.
	assert.equal(networkPrefix("1:2:3::5:6:7:8"), "v6:1:2:3:0::/64");
});

test("искажённый адрес не считается сетью", () => {
	// Мусор, разобранный «как-нибудь», мог бы совпасть с другим мусором и
	// дать вход без кода. Любой неразобранный адрес обязан давать null.
	const malformed = [
		"1.2.3.4.5",
		"1.2.3",
		"256.1.1.1",
		"1.2.3.+4",
		"x::ffff:192.0.2.1",
		"::ffff:192.0.2.1x",
		"1:2:3",
		"1:2:3:4:5:6:7:8:9",
		"1:2:3:4::5:6:7:8",
		"1::2::3",
		"gggg::1",
		"12345::1",
		"zz12::1",
		"2001::zz",
	];
	for (const ip of malformed) {
		assert.equal(networkPrefix(ip), null, ip);
	}
	assert.equal(networkPrefix("255.255.255.255"), "v4:255.255.255.0/24");
	assert.equal(networkPrefix(undefined as unknown as string), null);
});

// ─── Неизвестный адрес ──────────────────────────────────────────────────────

test("неизвестный или неразобранный адрес не совпадает ни с чем", () => {
	// Отказ закрытый: потеряли сведения о сети — значит, спрашиваем код. В
	// том числе неизвестный с неизвестным: два «не знаю» не равны друг другу.
	assert.equal(networkPrefix("unknown"), null);
	assert.equal(networkPrefix(""), null);
	assert.equal(networkPrefix("не адрес"), null);
	assert.equal(networkPrefix("999.1.1.1"), null);

	assert.ok(!sameNetwork("unknown", "unknown"));
	assert.ok(!sameNetwork("unknown", "192.0.2.17"));
});

// ─── Браузер ────────────────────────────────────────────────────────────────

const CHROME =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_NEXT_VERSION =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/141.0.0.0`;
const YANDEX = `${CHROME} YaBrowser/25.6.0.0 Safari/537.36`;
const FIREFOX =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const OPERA = `${CHROME} OPR/115.0.0.0`;
const SAFARI_IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("производные Chromium не опознаются как Chrome", () => {
	// Порядок проверок в browserFamily не случаен: у Edge и Яндекс.Браузера в
	// строке есть «Chrome», а у Chrome — «Safari».
	assert.equal(browserFamily(EDGE), "Edge");
	assert.equal(browserFamily(YANDEX), "Yandex");
	assert.equal(browserFamily(CHROME), "Chrome");
	assert.equal(browserFamily(FIREFOX), "Firefox");
	assert.equal(browserFamily(SAFARI_IPHONE), "Safari");
	assert.equal(browserFamily(OPERA), "Opera");
});

test("неопознанный или отсутствующий User-Agent — «Other»", () => {
	assert.equal(browserFamily("curl/8.7.1"), "Other");
	assert.equal(browserFamily(""), "Other");
	assert.equal(browserFamily(undefined as unknown as string), "Other");
});

test("обновление браузера отпечаток не меняет", () => {
	// Главное свойство: Chrome обновляется каждые несколько недель, и
	// сравнение User-Agent целиком снимало бы доверие после каждого обновления.
	assert.equal(
		deviceFingerprint("Windows", CHROME),
		deviceFingerprint("Windows", CHROME_NEXT_VERSION),
	);
});

test("другой браузер на той же машине — другой отпечаток", () => {
	assert.notEqual(
		deviceFingerprint("Windows", CHROME),
		deviceFingerprint("Windows", EDGE),
	);
});

test("тот же браузер на другом типе устройства — другой отпечаток", () => {
	assert.notEqual(
		deviceFingerprint("Windows", CHROME),
		deviceFingerprint("Android телефон", CHROME),
	);
});
