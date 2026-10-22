/**
 * Граничные случаи содержимого чата без базы: связка мастер-ключей и
 * шифртексты (crypto.ts), конверт сообщения (message-codec.ts), автоссылки
 * (linkify.ts), подстановка в заготовки (canned-render.ts), белый список
 * вложений и имя файла (attachments.ts).
 *
 * Дополняет pure.test.ts тем, что нашло мутационное тестирование: каждая
 * проверка здесь ловит конкретную поломку, которую прежние тесты пропускали.
 * Идёт в общем `pnpm test` и под Stryker (зона «чат поддержки»).
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";
import { renderCannedBody } from "../../src/modules/support-chat/lib/canned-render.ts";
import { linkify } from "../../src/modules/support-chat/lib/linkify.ts";
import {
	detectFileType,
	sanitizeFilename,
} from "../../src/modules/support-chat/server/attachments.ts";
import {
	aad,
	assertEncryptionConfigured,
	decryptBytes,
	decryptText,
	encryptBytes,
	encryptText,
	generateDataKey,
	parseKeyring,
	SupportCryptoError,
	unwrapDataKey,
} from "../../src/modules/support-chat/server/crypto.ts";
import {
	decodeMessagePayload,
	UNREADABLE_TEXT,
} from "../../src/modules/support-chat/server/message-codec.ts";

const b64 = () => randomBytes(32).toString("base64");
const ENV = "SUPPORT_ENCRYPTION_KEYS";

// ─── Связка ключей ──────────────────────────────────────────────────────────

describe("parseKeyring", () => {
	test("пробелы и пустые элементы списка пропускаются, первый — действующий", () => {
		const k1 = b64();
		const k2 = b64();
		const ring = parseKeyring(`  a:${k1} , , b_2-x:${k2},`);
		assert.equal(ring.activeId, "a");
		assert.deepEqual([...ring.keys.keys()], ["a", "b_2-x"]);
		assert.equal(ring.keys.get("a")?.toString("base64"), k1);
	});

	test("id: 1–16 латинских букв, цифр, _ и -; без id — отказ", () => {
		const key = b64();
		assert.equal(parseKeyring(`${"x".repeat(16)}:${key}`).activeId.length, 16);
		for (const bad of [
			`:${key}`,
			`${"x".repeat(17)}:${key}`,
			`!ab:${key}`,
			`ab!:${key}`,
			`а:${key}`,
			key,
		]) {
			assert.throws(
				() => parseKeyring(bad),
				(error: unknown) =>
					error instanceof SupportCryptoError &&
					error.name === "SupportCryptoError" &&
					/id:base64/.test(error.message),
				bad,
			);
		}
	});

	test("пустая связка — отдельная понятная ошибка", () => {
		for (const raw of ["", " , ,"]) {
			assert.throws(() => parseKeyring(raw), /SUPPORT_ENCRYPTION_KEYS пуст/);
		}
		assert.throws(
			() => parseKeyring(`k:${randomBytes(31).toString("base64")}`),
			/32 байта/,
		);
	});
});

describe("ключ из окружения", () => {
	let saved: string | undefined;
	beforeEach(() => {
		saved = process.env[ENV];
	});
	afterEach(() => {
		if (saved === undefined) delete process.env[ENV];
		else process.env[ENV] = saved;
	});

	test("без ключа процесс не стартует, с ключом — стартует", () => {
		delete process.env[ENV];
		assert.throws(() => assertEncryptionConfigured(), /не задан/);
		assert.throws(() => generateDataKey(), /не задан/);
		process.env[ENV] = `k:${b64()}`;
		assert.doesNotThrow(() => assertEncryptionConfigured());
	});

	test("обёрнутый ключ без известного id — отказ с этим id", () => {
		process.env[ENV] = `ab:${b64()}`;
		// «abc» без точки: id пустой — и ключ «ab» не должен подхватиться
		// по префиксу.
		assert.throws(() => unwrapDataKey("abc"), /Ключ «» отсутствует/);
		assert.throws(() => unwrapDataKey(".xyz"), /Ключ «» отсутствует/);
		assert.throws(() => unwrapDataKey("zz.xyz"), /Ключ «zz» отсутствует/);
		const { key, wrapped } = generateDataKey();
		assert.ok(wrapped.startsWith("ab."));
		assert.deepEqual(unwrapDataKey(wrapped), key);
	});
});

describe("совместимость с уже записанными данными", () => {
	let saved: string | undefined;
	beforeEach(() => {
		saved = process.env[ENV];
	});
	afterEach(() => {
		if (saved === undefined) delete process.env[ENV];
		else process.env[ENV] = saved;
	});

	// Получено этим же кодом 21.10.2026 и не должно меняться: в базе лежат
	// ключи диалогов, обёрнутые так, и сообщения, зашифрованные так. Если
	// тест упал — поменялся формат (AAD обёртки, место сообщения, префикс), и
	// вся записанная переписка перестанет читаться.
	test("эталон: обёрнутый ключ диалога и шифртекст сообщения", () => {
		process.env[ENV] = `gold:${Buffer.alloc(32, 7).toString("base64")}`;
		const dek = unwrapDataKey(
			"gold.1C1oIkIioDD_uWy-mErBARhXmr0craehVWCXfj97M_c1LH7GckqkQy7_a-WNKeHcsfvbS4wX-EQg9k1J",
		);
		assert.deepEqual(dek, Buffer.alloc(32, 9));
		assert.equal(
			decryptText(
				dek,
				"e1.tylQJg1k7OdU9t_qID8h-oyRFjwFUAdu1WyD6cQ0NVECYowt836Pq5ZOuejWBQeTCtMZiVS5oy1nkGxmI8sic-cbBSYxuUBd610fkNJT5yg",
				aad.message({
					conversationId: 1,
					seq: 1,
					kind: "text",
					authorType: "user",
				}),
			),
			"Здравствуйте! Заказ ORD-2026-000012",
		);
	});
});

// ─── Шифртексты ─────────────────────────────────────────────────────────────

describe("шифртексты", () => {
	const key = randomBytes(32);

	test("текст: префикс версии e1., чужой префикс — отказ", () => {
		const sealed = encryptText(key, "привет", "place");
		assert.ok(sealed.startsWith("e1."));
		assert.equal(decryptText(key, sealed, "place"), "привет");
		assert.throws(
			() => decryptText(key, `e2.${sealed.slice(3)}`, "place"),
			/Неизвестный формат шифртекста/,
		);
	});

	test("короче IV+тега — «повреждён»; пустые данные ровно IV+тег — читаются", () => {
		for (const size of [0, 4, 27]) {
			assert.throws(
				() => decryptBytes(key, Buffer.alloc(size), "p"),
				/Шифртекст повреждён/,
			);
		}
		const empty = encryptBytes(key, Buffer.alloc(0), "p");
		assert.equal(empty.length, 28);
		assert.deepEqual(decryptBytes(key, empty, "p"), Buffer.alloc(0));
	});

	test("подмена, чужое место, чужой ключ — одна и та же ошибка", () => {
		const sealed = encryptBytes(key, Buffer.from("файл"), "p");
		const tampered = Buffer.from(sealed);
		tampered[13] ^= 1;
		for (const [k, data, place] of [
			[key, tampered, "p"],
			[key, sealed, "q"],
			[key, sealed, ""],
			[randomBytes(32), sealed, "p"],
		] as const) {
			assert.throws(
				() => decryptBytes(k, data, place),
				/данные повреждены или подменены/,
			);
		}
	});
});

// ─── Конверт сообщения ──────────────────────────────────────────────────────

describe("decodeMessagePayload", () => {
	let saved: string | undefined;
	beforeEach(() => {
		saved = process.env[ENV];
		process.env[ENV] = `k:${b64()}`;
	});
	afterEach(() => {
		if (saved === undefined) delete process.env[ENV];
		else process.env[ENV] = saved;
	});

	const place = { conversationId: 1, seq: 2, kind: "text", authorType: "user" };
	const decodeRaw = (envelope: unknown) => {
		const { key, wrapped } = generateDataKey();
		const ciphertext = encryptText(
			key,
			JSON.stringify(envelope),
			aad.message(place),
		);
		return decodeMessagePayload(wrapped, place, ciphertext);
	};

	test("поля конверта проверяются по типу", () => {
		assert.deepEqual(decodeRaw({ v: 1, t: 5, c: "заказ", m: "1" }), {
			text: "",
			context: null,
			mediaIds: [],
		});
		assert.deepEqual(decodeRaw({ v: 1 }), {
			text: "",
			context: null,
			mediaIds: [],
		});
		assert.deepEqual(
			decodeRaw({
				v: 1,
				t: "есть",
				c: { type: "order", id: 5 },
				m: ["7", 8, 2.5, "x", null],
			}),
			{ text: "есть", context: { type: "order", id: 5 }, mediaIds: [7, 8, 0] },
		);
	});

	test("нет ключа или не строка — null, без исключения", () => {
		const { key, wrapped } = generateDataKey();
		const ciphertext = encryptText(key, "{}", aad.message(place));
		assert.equal(decodeMessagePayload(null, place, ciphertext), null);
		assert.equal(decodeMessagePayload("", place, ciphertext), null);
		assert.equal(decodeMessagePayload(wrapped, place, 42), null);
		assert.equal(decodeMessagePayload(wrapped, place, "e1.мусор"), null);
	});

	test("пометка вместо нерасшифрованного текста", () => {
		assert.equal(UNREADABLE_TEXT, "[не удалось расшифровать]");
	});
});

// ─── Автоссылки ─────────────────────────────────────────────────────────────

describe("linkify — структура частей", () => {
	test("текст, ссылки и хвостовая пунктуация — по местам", () => {
		assert.deepEqual(linkify("см. https://a.ru/x и http://b.ru/y)."), [
			{ type: "text", value: "см. " },
			{ type: "link", value: "https://a.ru/x", href: "https://a.ru/x" },
			{ type: "text", value: " и " },
			{ type: "link", value: "http://b.ru/y", href: "http://b.ru/y" },
			{ type: "text", value: ")." },
		]);
	});

	test("точка внутри адреса остаётся в ссылке", () => {
		assert.deepEqual(linkify("https://a.ru/a.b"), [
			{ type: "link", value: "https://a.ru/a.b", href: "https://a.ru/a.b" },
		]);
		assert.deepEqual(linkify("https://a.ru/a.b, дальше"), [
			{ type: "link", value: "https://a.ru/a.b", href: "https://a.ru/a.b" },
			{ type: "text", value: ", дальше" },
		]);
	});

	test("без ссылок, пустой текст, ссылка в начале и в конце", () => {
		assert.deepEqual(linkify(""), []);
		assert.deepEqual(linkify("просто текст"), [
			{ type: "text", value: "просто текст" },
		]);
		assert.deepEqual(linkify("https://a.ru конец"), [
			{ type: "link", value: "https://a.ru", href: "https://a.ru/" },
			{ type: "text", value: " конец" },
		]);
		assert.deepEqual(linkify("начало https://a.ru"), [
			{ type: "text", value: "начало " },
			{ type: "link", value: "https://a.ru", href: "https://a.ru/" },
		]);
	});

	test("непарсящийся адрес — текстом", () => {
		assert.deepEqual(linkify("http://[::1 x"), [
			{ type: "text", value: "http://[::1" },
			{ type: "text", value: " x" },
		]);
	});
});

// ─── Заготовки ──────────────────────────────────────────────────────────────

describe("renderCannedBody — пробелы", () => {
	test("пробелы внутри скобок допустимы, значение обрезается", () => {
		assert.deepEqual(
			renderCannedBody("{{ имя }}, привет", { имя: "\tАнна\t" }),
			{ text: "Анна, привет", missing: [] },
		);
	});

	test("значение из одних пробелов — незаполнено", () => {
		assert.deepEqual(renderCannedBody("Здравствуйте {{имя}}!", { имя: "  " }), {
			text: "Здравствуйте!",
			missing: ["имя"],
		});
	});

	test("без имени — без висящей запятой и с заглавной", () => {
		assert.deepEqual(renderCannedBody("Здравствуйте, {{имя}}!", {}), {
			text: "Здравствуйте!",
			missing: ["имя"],
		});
		assert.deepEqual(
			renderCannedBody("{{имя}}, здравствуйте! Заказ {{номерЗаказа}}.", {}),
			{ text: "Здравствуйте! Заказ.", missing: ["имя", "номерЗаказа"] },
		);
		assert.deepEqual(renderCannedBody("Спасибо, {{менеджер}}.", {}), {
			text: "Спасибо.",
			missing: ["менеджер"],
		});
		// Заполненный текст не трогаем, даже если в нём такое написано.
		assert.equal(
			renderCannedBody("а,! {{имя}}", { имя: "Анна" }).text,
			"а,! Анна",
		);
	});

	test("двойные пробелы схлопываются, края обрезаются", () => {
		assert.deepEqual(renderCannedBody("  а  б  ", {}), {
			text: "а б",
			missing: [],
		});
	});
});

// ─── Вложения ───────────────────────────────────────────────────────────────

const zip = (...parts: string[]) =>
	Buffer.concat([
		Buffer.from([0x50, 0x4b, 0x03, 0x04]),
		Buffer.from(parts.join("\0")),
	]);
const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("detectFileType — точный тип", () => {
	test("каждый тип белого списка", () => {
		const riff = (tag: string) =>
			Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from(tag)]);
		const cases: [Buffer, unknown][] = [
			[
				Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
				{ kind: "image", mime: "image/jpeg", ext: "jpg" },
			],
			[
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
				{ kind: "image", mime: "image/png", ext: "png" },
			],
			[riff("WEBP"), { kind: "image", mime: "image/webp", ext: "webp" }],
			[
				Buffer.from("%PDF-1.7"),
				{ kind: "document", mime: "application/pdf", ext: "pdf" },
			],
			[
				zip("[Content_Types].xml", "word/document.xml"),
				{ kind: "document", mime: DOCX, ext: "docx" },
			],
			[
				zip("[Content_Types].xml", "xl/workbook.xml"),
				{ kind: "document", mime: XLSX, ext: "xlsx" },
			],
		];
		for (const [buffer, expected] of cases) {
			assert.deepEqual(detectFileType(buffer), expected);
		}
	});

	test("RIFF не WebP и WebP без RIFF — не принимаются", () => {
		const make = (head: string, tag: string) =>
			Buffer.concat([Buffer.from(head), Buffer.alloc(4), Buffer.from(tag)]);
		assert.equal(detectFileType(make("RIFF", "WAVE")), null);
		assert.equal(detectFileType(make("XXXX", "WEBP")), null);
	});

	test("ZIP: без оглавления, без известной части, без сигнатуры — нет", () => {
		assert.equal(detectFileType(zip("word/document.xml")), null);
		assert.equal(detectFileType(zip("[Content_Types].xml", "ppt/x.xml")), null);
		// Имена частей есть, а это не ZIP.
		assert.equal(
			detectFileType(Buffer.from("[Content_Types].xml word/document.xml")),
			null,
		);
	});
});

describe("sanitizeFilename", () => {
	test("без пути, без опасных символов, с расширением настоящего типа", () => {
		assert.equal(sanitizeFilename("../../etc/passwd.exe", "pdf"), "passwd.pdf");
		assert.equal(
			sanitizeFilename("C:\\Users\\x\\отчёт.final.docx", "docx"),
			"отчёт.final.docx",
		);
		assert.equal(sanitizeFilename('a\u0001b<>|"*?:.png', "png"), "ab.png");
		assert.equal(sanitizeFilename("  имя  .jpg", "jpg"), "имя.jpg");
		assert.equal(sanitizeFilename("", "pdf"), "файл.pdf");
		assert.equal(sanitizeFilename("dir/", "pdf"), "файл.pdf");
		assert.equal(sanitizeFilename(`${"я".repeat(150)}.pdf`, "pdf").length, 104);
	});
});
