/**
 * Чат поддержки: чистые функции — без базы и Redis.
 *
 *   pnpm test:support-chat
 *
 * Распределение, рабочее время и оценка ответа, схемы событий, присутствие,
 * источник рукопожатия, шифрование, стеммер и подбор заготовок, подстановка
 * переменных, распознавание типа файла.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, test } from "node:test";
import { renderCannedBody } from "../../src/modules/support-chat/lib/canned-render.ts";
import { linkify } from "../../src/modules/support-chat/lib/linkify.ts";
import {
	messageSendSchema,
	staffMessageSendSchema,
	staffTagsSchema,
} from "../../src/modules/support-chat/lib/schemas.ts";
import {
	stemRu,
	stemTerms,
} from "../../src/modules/support-chat/lib/stem-ru.ts";
import {
	detectFileType,
	sanitizeFilename,
} from "../../src/modules/support-chat/server/attachments.ts";
import { rankCanned } from "../../src/modules/support-chat/server/canned-match.ts";
import {
	aad,
	decryptText,
	encryptText,
	generateDataKey,
	isWrappedWithStaleKey,
	parseKeyring,
	unwrapDataKey,
} from "../../src/modules/support-chat/server/crypto.ts";
import {
	computeEta,
	isWithinWorkingHours,
	nextOpening,
} from "../../src/modules/support-chat/server/eta.ts";
import { isAllowedHandshakeSource } from "../../src/modules/support-chat/server/gateway/auth.ts";
import {
	decodeMessagePayload,
	encodeMessagePayload,
} from "../../src/modules/support-chat/server/message-codec.ts";
import {
	AWAY_AFTER_MS,
	effectiveStatus,
	OFFLINE_AFTER_MS,
} from "../../src/modules/support-chat/server/presence.ts";
import {
	type AgentCandidate,
	pickAgent,
} from "../../src/modules/support-chat/server/routing.ts";
import {
	normalizeSupportSettings,
	type SupportConfig,
} from "../../src/modules/support-chat/server/settings.ts";

// ─── Распределение ──────────────────────────────────────────────────────────

const agent = (
	overrides: Partial<AgentCandidate> & { adminId: number },
): AgentCandidate => ({
	status: "available",
	openCount: 0,
	topics: [],
	lastAssignedAt: null,
	...overrides,
});

describe("pickAgent", () => {
	test("никого на месте — null", () => {
		assert.equal(
			pickAgent(
				[
					agent({ adminId: 1, status: "away" }),
					agent({ adminId: 2, status: "offline" }),
				],
				"order",
			),
			null,
		);
	});

	test("лимита нет: занятый менеджер всё равно получает диалог, если он один", () => {
		assert.equal(
			pickAgent([agent({ adminId: 1, openCount: 500 })], "order"),
			1,
		);
	});

	test("меньше открытых диалогов — раньше", () => {
		const chosen = pickAgent(
			[
				agent({ adminId: 1, openCount: 4 }),
				agent({ adminId: 2, openCount: 3 }),
			],
			"other",
		);
		assert.equal(chosen, 2);
	});

	test("при равной загрузке — тот, кому дольше ничего не доставалось", () => {
		const chosen = pickAgent(
			[
				agent({ adminId: 1, lastAssignedAt: 2_000 }),
				agent({ adminId: 2, lastAssignedAt: 1_000 }),
				agent({ adminId: 3, lastAssignedAt: 3_000 }),
			],
			"other",
		);
		assert.equal(chosen, 2);
	});

	test("специалист по теме важнее загрузки", () => {
		const chosen = pickAgent(
			[
				agent({ adminId: 1 }),
				agent({ adminId: 2, openCount: 3, topics: ["documents"] }),
			],
			"documents",
		);
		assert.equal(chosen, 2);
	});

	test("менеджер с чужими темами — только когда больше некому", () => {
		assert.equal(
			pickAgent(
				[
					agent({ adminId: 1, topics: ["payment"] }),
					agent({ adminId: 2, openCount: 4 }),
				],
				"documents",
			),
			2,
		);
		assert.equal(
			pickAgent([agent({ adminId: 1, topics: ["payment"] })], "documents"),
			1,
		);
	});
});

// ─── Рабочее время и оценка ответа ──────────────────────────────────────────

/** Расписание владельца: будни 09–18, выходные 09–18 со сроком 60 минут. */
function configWith(
	overrides: Partial<Parameters<typeof normalizeSupportSettings>[0]> = {},
): SupportConfig {
	return normalizeSupportSettings({
		timezone: "Europe/Moscow",
		schedule: [
			...(["mon", "tue", "wed", "thu", "fri"] as const).map((day) => ({
				day,
				opensAt: "09:00",
				closesAt: "18:00",
			})),
			...(["sat", "sun"] as const).map((day) => ({
				day,
				opensAt: "09:00",
				closesAt: "18:00",
				slaMinutes: 60,
			})),
		],
		routing: {
			mode: "auto",
			firstResponseSlaMinutes: 15,
			reassignAfterMinutes: 10,
		},
		...overrides,
	});
}

// Пятница, 9 октября 2026. Москва — UTC+3 круглый год.
const FRIDAY_NOON_MSK = new Date("2026-10-09T09:00:00Z");
const FRIDAY_EVENING_MSK = new Date("2026-10-09T16:30:00Z"); // 19:30
const SATURDAY_NOON_MSK = new Date("2026-10-10T09:00:00Z");
const SUNDAY_EVENING_MSK = new Date("2026-10-11T16:30:00Z"); // 19:30
const MONDAY_EARLY_MSK = new Date("2026-10-12T04:00:00Z"); // 07:00

describe("рабочее время", () => {
	const config = configWith();

	test("границы интервала: открытие включительно, закрытие — нет", () => {
		assert.equal(
			isWithinWorkingHours(new Date("2026-10-09T06:00:00Z"), config),
			true,
		);
		assert.equal(
			isWithinWorkingHours(new Date("2026-10-09T05:59:00Z"), config),
			false,
		);
		assert.equal(
			isWithinWorkingHours(new Date("2026-10-09T15:00:00Z"), config),
			false,
		);
		assert.equal(
			isWithinWorkingHours(new Date("2026-10-09T14:59:00Z"), config),
			true,
		);
	});

	test("выходные — тоже рабочее время", () => {
		assert.equal(isWithinWorkingHours(SATURDAY_NOON_MSK, config), true);
	});

	test("пояс поддержки, а не UTC: 23:30 UTC четверга — уже пятница 02:30 в Москве", () => {
		const late = new Date("2026-10-08T23:30:00Z");
		assert.equal(isWithinWorkingHours(late, config), false);
		const opening = nextOpening(late, config);
		assert.equal(opening?.at.toISOString(), "2026-10-09T06:00:00.000Z");
		assert.equal(opening?.daysAhead, 0);
	});

	test("пятница вечером → суббота 09:00 (выходные рабочие)", () => {
		const opening = nextOpening(FRIDAY_EVENING_MSK, config);
		assert.equal(opening?.at.toISOString(), "2026-10-10T06:00:00.000Z");
		assert.equal(opening?.daysAhead, 1);
	});

	test("праздник пропускается", () => {
		const withHoliday = configWith({
			holidays: [{ date: "2026-10-12T09:00:00.000Z", id: "h1" }],
		});
		assert.equal(
			isWithinWorkingHours(new Date("2026-10-12T08:00:00Z"), withHoliday),
			false,
		);
		assert.equal(
			nextOpening(SUNDAY_EVENING_MSK, withHoliday)?.at.toISOString(),
			"2026-10-13T06:00:00.000Z",
		);
	});

	test("пустое расписание — открытия нет", () => {
		assert.equal(
			nextOpening(FRIDAY_NOON_MSK, configWith({ schedule: [] })),
			null,
		);
	});
});

describe("computeEta", () => {
	const config = configWith();
	const eta = (now: Date, availableAgents: number, queueDepth: number) =>
		computeEta({ now, config, availableAgents, queueDepth });

	test("нерабочее время — фраза с ближайшим открытием", () => {
		const result = eta(SUNDAY_EVENING_MSK, 0, 0);
		assert.equal(result.online, false);
		assert.equal(result.nextOpenAt, "2026-10-12T06:00:00.000Z");
		assert.match(result.label, /завтра с 09:00/);
	});

	test("утро понедельника до открытия — «сегодня»", () => {
		assert.match(eta(MONDAY_EARLY_MSK, 0, 0).label, /сегодня с 09:00/);
	});

	test("будни, менеджер на месте, очереди нет — несколько минут", () => {
		const result = eta(FRIDAY_NOON_MSK, 1, 0);
		assert.equal(result.online, true);
		assert.equal(result.minutes, 5);
	});

	test("очередь растёт — оценка растёт", () => {
		assert.equal(eta(FRIDAY_NOON_MSK, 1, 8).minutes, 30);
	});

	test("будни, никого нет — общий срок 15 минут", () => {
		assert.equal(eta(FRIDAY_NOON_MSK, 0, 0).minutes, 15);
	});

	test("выходные медленнее: даже со свободным менеджером — не быстрее часа", () => {
		const result = eta(SATURDAY_NOON_MSK, 2, 0);
		assert.equal(result.online, true);
		assert.equal(result.minutes, 60);
		assert.match(result.label, /в течение часа/);
	});
});

// ─── Схемы ──────────────────────────────────────────────────────────────────

describe("схемы событий", () => {
	const base = { clientMessageId: "0199d1c0-7d6e-7c2e-9f6a-3b1c2d4e5f60" };

	test("управляющие символы вычищаются, переводы строк остаются", () => {
		const parsed = messageSendSchema.parse({
			...base,
			body: "  при\u0000вет\n\tмир\u0007  ",
		});
		assert.equal(parsed.body, "привет\n\tмир");
	});

	test("пустое сообщение без вложений отклоняется, с вложением или документом — нет", () => {
		assert.equal(
			messageSendSchema.safeParse({ ...base, body: "   " }).success,
			false,
		);
		assert.equal(
			messageSendSchema.safeParse({ ...base, body: "", attachmentIds: [1] })
				.success,
			true,
		);
		assert.equal(
			staffMessageSendSchema.safeParse({
				...base,
				conversationId: 1,
				body: "",
				documentIds: [3],
			}).success,
			true,
		);
	});

	test("ссылка в контексте — только путь сайта", () => {
		const parse = (url: string) =>
			messageSendSchema.safeParse({
				...base,
				body: "x",
				context: { type: "page", url },
			}).success;
		assert.equal(parse("/orders/ORD-2026-000001"), true);
		assert.equal(parse("https://evil.example/"), false);
		assert.equal(parse("//evil.example/"), false);
		assert.equal(parse("javascript:alert(1)"), false);
	});

	test("слишком длинное сообщение и неверный clientMessageId", () => {
		assert.equal(
			messageSendSchema.safeParse({ ...base, body: "я".repeat(4001) }).success,
			false,
		);
		assert.equal(
			messageSendSchema.safeParse({ clientMessageId: "1", body: "x" }).success,
			false,
		);
	});

	test("метки: без повторов и в нижнем регистре", () => {
		const parsed = staffTagsSchema.parse({
			conversationId: 1,
			tags: ["Опт", "опт", " Срочно "],
		});
		assert.deepEqual(parsed.tags, ["опт", "срочно"]);
	});
});

// ─── Присутствие и рукопожатие ──────────────────────────────────────────────

describe("effectiveStatus", () => {
	const now = 10_000_000;

	test("нет пульса дольше порога — не в сети", () => {
		assert.equal(
			effectiveStatus(
				{
					status: "available",
					lastSeen: now - OFFLINE_AFTER_MS - 1,
					lastActivity: now,
				},
				now,
			),
			"offline",
		);
	});

	test("давно без действий — отошёл, даже если не переключался", () => {
		assert.equal(
			effectiveStatus(
				{
					status: "available",
					lastSeen: now,
					lastActivity: now - AWAY_AFTER_MS - 1,
				},
				now,
			),
			"away",
		);
	});

	test("пульс и действия свежие — на месте", () => {
		assert.equal(
			effectiveStatus(
				{ status: "available", lastSeen: now, lastActivity: now },
				now,
			),
			"available",
		);
		assert.equal(
			effectiveStatus(
				{ status: "away", lastSeen: now, lastActivity: now },
				now,
			),
			"away",
		);
	});
});

describe("isAllowedHandshakeSource", () => {
	const allowed = ["https://npo-polet.ru", "https://admin.npo-polet.ru"];

	test("Origin решает, если он есть", () => {
		assert.equal(
			isAllowedHandshakeSource({ origin: "https://npo-polet.ru" }, allowed),
			true,
		);
		assert.equal(
			isAllowedHandshakeSource({ origin: "https://evil.example" }, allowed),
			false,
		);
		assert.equal(
			isAllowedHandshakeSource(
				{ origin: "https://evil.example", referer: "https://npo-polet.ru/" },
				allowed,
			),
			false,
		);
	});

	test("без Origin: Sec-Fetch-Site, затем Referer", () => {
		assert.equal(
			isAllowedHandshakeSource({ "sec-fetch-site": "same-origin" }, allowed),
			true,
		);
		assert.equal(
			isAllowedHandshakeSource({ "sec-fetch-site": "cross-site" }, allowed),
			false,
		);
		assert.equal(
			isAllowedHandshakeSource(
				{ referer: "https://npo-polet.ru/catalog" },
				allowed,
			),
			true,
		);
		assert.equal(
			isAllowedHandshakeSource({ referer: "https://evil.example/" }, allowed),
			false,
		);
	});

	test("ни одного признака — отказ", () => {
		assert.equal(isAllowedHandshakeSource({}, allowed), false);
	});
});

// ─── Шифрование ─────────────────────────────────────────────────────────────

// Чистым тестам .env не нужен: свой одноразовый мастер-ключ.
process.env.SUPPORT_ENCRYPTION_KEYS ??= `test:${randomBytes(32).toString("base64")}`;

describe("шифрование", () => {
	const place = {
		conversationId: 7,
		seq: 3,
		kind: "text",
		authorType: "customer",
	};

	test("связка ключей: формат, длина, первый — действующий", () => {
		const k1 = randomBytes(32).toString("base64");
		const k2 = randomBytes(32).toString("base64");
		const ring = parseKeyring(`new:${k1}, old:${k2}`);
		assert.equal(ring.activeId, "new");
		assert.equal(ring.keys.size, 2);
		assert.throws(() => parseKeyring("bad"), /id:base64/);
		assert.throws(
			() => parseKeyring(`k:${randomBytes(16).toString("base64")}`),
			/32 байта/,
		);
		assert.throws(() => parseKeyring(`k:${k1},k:${k2}`), /дважды/);
	});

	test("сообщение: туда и обратно; в шифртексте нет открытого текста", () => {
		const { key, wrapped } = generateDataKey();
		const secret = "Паспорт 4510 123456, доверенность во вложении";
		const ciphertext = encodeMessagePayload(key, place, {
			text: secret,
			context: { type: "order", id: 5, title: "ORD-2026-000005" },
			mediaIds: [12],
		});
		assert.ok(!ciphertext.includes("Паспорт"));
		assert.ok(!ciphertext.includes("ORD-2026"));
		const decoded = decodeMessagePayload(wrapped, place, ciphertext);
		assert.equal(decoded?.text, secret);
		assert.equal(decoded?.context?.title, "ORD-2026-000005");
		assert.deepEqual(decoded?.mediaIds, [12]);
	});

	test("одинаковый текст шифруется по-разному (случайный IV)", () => {
		const { key } = generateDataKey();
		const a = encryptText(key, "одно и то же", "x");
		const b = encryptText(key, "одно и то же", "x");
		assert.notEqual(a, b);
	});

	test("подмена места не расшифровывается: заметка → текст, чужой диалог, другой номер", () => {
		const { key, wrapped } = generateDataKey();
		const note = { ...place, kind: "note", authorType: "staff" };
		const ciphertext = encodeMessagePayload(key, note, {
			text: "внутреннее",
			context: null,
			mediaIds: [],
		});
		assert.equal(
			decodeMessagePayload(wrapped, { ...note, kind: "text" }, ciphertext),
			null,
		);
		assert.equal(
			decodeMessagePayload(wrapped, { ...note, conversationId: 8 }, ciphertext),
			null,
		);
		assert.equal(
			decodeMessagePayload(wrapped, { ...note, seq: 4 }, ciphertext),
			null,
		);
		assert.equal(
			decodeMessagePayload(wrapped, note, ciphertext)?.text,
			"внутреннее",
		);
	});

	test("испорченный шифртекст и чужой ключ — отказ, а не мусор", () => {
		const one = generateDataKey();
		const other = generateDataKey();
		const ciphertext = encryptText(one.key, "секрет", aad.csat(1));
		const tampered = `${ciphertext.slice(0, -4)}AAAA`;
		assert.throws(() => decryptText(one.key, tampered, aad.csat(1)));
		assert.throws(() => decryptText(other.key, ciphertext, aad.csat(1)));
	});

	test("ключ данных разворачивается и после смены мастер-ключа (старый в связке)", () => {
		const original = process.env.SUPPORT_ENCRYPTION_KEYS;
		try {
			const oldKek = randomBytes(32).toString("base64");
			process.env.SUPPORT_ENCRYPTION_KEYS = `old:${oldKek}`;
			const { key, wrapped } = generateDataKey();
			assert.equal(isWrappedWithStaleKey(wrapped), false);

			process.env.SUPPORT_ENCRYPTION_KEYS = `new:${randomBytes(32).toString("base64")},old:${oldKek}`;
			assert.equal(isWrappedWithStaleKey(wrapped), true);
			assert.deepEqual(unwrapDataKey(wrapped), key);

			process.env.SUPPORT_ENCRYPTION_KEYS = `new:${randomBytes(32).toString("base64")}`;
			assert.throws(() => unwrapDataKey(wrapped), /отсутствует/);
		} finally {
			process.env.SUPPORT_ENCRYPTION_KEYS = original;
		}
	});
});

// ─── Стеммер и заготовки ────────────────────────────────────────────────────

describe("стеммер и подбор заготовок", () => {
	test("формы одного слова сводятся к одной основе", () => {
		const same = (words: string[]) =>
			assert.equal(new Set(words.map(stemRu)).size, 1, words.join());
		same(["сертификат", "сертификаты", "сертификатов", "сертификатами"]);
		same(["декларация", "декларации", "декларацию"]);
		same(["доставка", "доставки", "доставку", "доставкой"]);
		same(["сеткомёт", "сеткомета", "сеткометы"]);
	});

	test("служебные слова и приветствия отбрасываются", () => {
		assert.deepEqual(stemTerms("Здравствуйте, а есть ли у вас?"), []);
	});

	const candidates = [
		{ id: 1, triggers: ["сертификат"], topics: ["documents"], usageCount: 0 },
		{ id: 2, triggers: ["декларация соответствия"], topics: [], usageCount: 0 },
		{
			id: 3,
			triggers: ["доставка", "сроки доставки"],
			topics: [],
			usageCount: 50,
		},
	];

	test("триггер ловит другую словоформу", () => {
		const ranked = rankCanned(
			"Добрый день! А сертификатЫ на сеткомёт есть?",
			"other",
			candidates,
		);
		assert.deepEqual(
			ranked.map((r) => r.id),
			[1],
		);
	});

	test("фраза из нескольких слов — нужны все, в любом порядке", () => {
		assert.deepEqual(
			rankCanned("нужна декларация", "other", candidates).map((r) => r.id),
			[],
		);
		assert.deepEqual(
			rankCanned("Пришлите соответствия декларацию", "other", candidates).map(
				(r) => r.id,
			),
			[2],
		);
	});

	test("ранжирование: больше совпавших фраз и частое использование — выше", () => {
		const ranked = rankCanned(
			"Какие сроки доставки и есть ли сертификат?",
			"other",
			candidates,
		);
		assert.equal(ranked[0].id, 3);
		assert.ok(ranked.some((r) => r.id === 1));
	});
});

describe("renderCannedBody", () => {
	test("подставляет переменные", () => {
		const { text, missing } = renderCannedBody(
			"{{имя}}, здравствуйте! Заказ {{номерЗаказа}} отправлен. {{менеджер}}",
			{ имя: "Иван", номерЗаказа: "ORD-2026-000012", менеджер: "Анна" },
		);
		assert.equal(
			text,
			"Иван, здравствуйте! Заказ ORD-2026-000012 отправлен. Анна",
		);
		assert.deepEqual(missing, []);
	});

	test("незаполненная переменная не доезжает скобками и попадает в список", () => {
		const { text, missing } = renderCannedBody(
			"Заказ {{номерЗаказа}}, отправлен.",
			{},
		);
		assert.equal(text, "Заказ, отправлен.");
		assert.deepEqual(missing, ["номерЗаказа"]);
	});

	test("значение вставляется как есть: без повторной подстановки и $-шаблонов", () => {
		const { text } = renderCannedBody("Здравствуйте, {{имя}}! {{менеджер}}", {
			имя: "<b>Иван</b> $& {{менеджер}}",
			менеджер: "Анна",
		});
		assert.equal(text, "Здравствуйте, <b>Иван</b> $& {{менеджер}}! Анна");
	});
});

describe("linkify", () => {
	const links = (text: string) =>
		linkify(text)
			.filter((part) => part.type === "link")
			.map((part) => (part.type === "link" ? part.href : ""));

	test("http(s) — ссылка, хвостовая пунктуация в неё не входит", () => {
		assert.deepEqual(links("См. https://npo-polet.ru/faq?q=1."), [
			"https://npo-polet.ru/faq?q=1",
		]);
		assert.deepEqual(links("(http://example.test/a)"), [
			"http://example.test/a",
		]);
	});

	test("javascript:, data:, разметка — обычный текст", () => {
		for (const text of [
			"javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			'<a href="javascript:alert(1)">тык</a>',
		]) {
			assert.deepEqual(links(text), [], text);
			assert.equal(
				linkify(text)
					.map((part) => part.value)
					.join(""),
				text,
				"текст сохраняется целиком",
			);
		}
	});
});

// ─── Тип файла ──────────────────────────────────────────────────────────────

describe("detectFileType", () => {
	test("по содержимому, а не по имени", () => {
		assert.equal(
			detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime,
			"image/jpeg",
		);
		assert.equal(
			detectFileType(
				Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			)?.mime,
			"image/png",
		);
		assert.equal(
			detectFileType(Buffer.from("%PDF-1.7\n"))?.mime,
			"application/pdf",
		);
		assert.equal(detectFileType(Buffer.from("MZ\x90\x00 исполняемый")), null);
		assert.equal(detectFileType(Buffer.from("<svg onload=alert(1)>")), null);
	});

	test("OOXML: Word и Excel принимаются, с макросами — нет", () => {
		const zip = (...parts: string[]) =>
			Buffer.concat([
				Buffer.from([0x50, 0x4b, 0x03, 0x04]),
				Buffer.from(parts.join("\0")),
			]);
		assert.equal(
			detectFileType(zip("[Content_Types].xml", "word/document.xml"))?.ext,
			"docx",
		);
		assert.equal(
			detectFileType(zip("[Content_Types].xml", "xl/workbook.xml"))?.ext,
			"xlsx",
		);
		assert.equal(
			detectFileType(
				zip("[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"),
			),
			null,
		);
		assert.equal(detectFileType(zip("просто архив")), null);
	});

	test("имя: без пути и опасных символов, расширение — настоящего типа", () => {
		assert.equal(sanitizeFilename("../../etc/passwd.exe", "pdf"), "passwd.pdf");
		assert.equal(
			sanitizeFilename('C:\\Docs\\Скан "паспорта".jpeg', "jpg"),
			"Скан паспорта.jpg",
		);
		assert.equal(sanitizeFilename("", "png"), "файл.png");
	});
});
