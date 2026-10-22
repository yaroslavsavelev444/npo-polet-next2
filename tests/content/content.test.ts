/**
 * Контентные модули без базы: поиск по FAQ и текст ответа, база знаний
 * (видео в iframe, фильтры из адреса, поиск и подсветка), форма обратной
 * связи, согласие на cookie.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { extractPlainText } from "../../src/modules/faq/lib/extractPlainText.ts";
import {
	countQuestions,
	filterFaqTopics,
} from "../../src/modules/faq/lib/filterFaq.ts";
import type { FaqTopicView } from "../../src/modules/faq/types/index.ts";
import {
	FEEDBACK_LIMITS,
	feedbackFormSchema,
} from "../../src/modules/feedback/schemas/feedback.schema.ts";
import { parseKnowledgeSearchParams } from "../../src/modules/knowledge/lib/parseFilters.ts";
import {
	buildSnippet,
	buildTsQuery,
	normalizeForSearch,
	parseQueryTerms,
	splitByTerms,
	toHighlightStems,
} from "../../src/modules/knowledge/lib/search.ts";
import {
	ALLOWED_EMBED_FRAME_SRC,
	parseVideoUrl,
} from "../../src/modules/knowledge/lib/videoEmbed.ts";

// ─── FAQ ────────────────────────────────────────────────────────────────────

const question = (q: string, plainAnswer: string) =>
	({ id: q, slug: q, question: q, answer: null, plainAnswer }) as never;
const TOPICS: FaqTopicView[] = [
	{
		id: "1",
		slug: "dostavka",
		title: "Доставка",
		description: "Сроки и способы",
		questions: [
			question("Как доставляете?", "Транспортной компанией"),
			question("Сколько ждать?", "От трёх дней"),
		],
	},
	{
		id: "2",
		slug: "oplata",
		title: "Оплата",
		description: null,
		questions: [
			question("Можно по счёту?", "Да, для юрлиц"),
			question("Ещё вопрос", "Ёмкий ответ"),
		],
	},
];

describe("FAQ", () => {
	test("совпала тема — все её вопросы; совпал вопрос — только он", () => {
		assert.deepEqual(
			filterFaqTopics(TOPICS, "  ДОСТАВКА ").map((t) => t.questions.length),
			[2],
		);
		assert.deepEqual(filterFaqTopics(TOPICS, "сроки")[0].slug, "dostavka");
		const bySchet = filterFaqTopics(TOPICS, "счёту");
		assert.equal(bySchet.length, 1);
		assert.deepEqual(
			bySchet[0].questions.map((q) => q.question),
			["Можно по счёту?"],
		);
		// Поиск по тексту ответа и «ё» = «е».
		assert.equal(filterFaqTopics(TOPICS, "емкий")[0].questions.length, 1);
		assert.equal(filterFaqTopics(TOPICS, "трех")[0].slug, "dostavka");
	});

	test("пустой запрос — всё, ничего не нашлось — пусто", () => {
		assert.equal(filterFaqTopics(TOPICS, "   "), TOPICS);
		assert.deepEqual(filterFaqTopics(TOPICS, "телепорт"), []);
		assert.equal(countQuestions(TOPICS), 4);
		assert.equal(countQuestions([]), 0);
	});

	test("текст ответа: абзацы и пункты через перевод строки", () => {
		const answer = {
			root: {
				type: "root",
				children: [
					{ type: "paragraph", children: [{ text: "Первый  абзац." }] },
					{
						type: "list",
						children: [
							{ type: "listitem", children: [{ text: "пункт 1" }] },
							{ type: "listitem", children: [{ text: "пункт 2" }] },
						],
					},
					{ type: "paragraph", children: [] },
				],
			},
		};
		assert.equal(
			extractPlainText(answer as never),
			"Первый абзац.\nпункт 1\nпункт 2",
		);
		assert.equal(extractPlainText(null), "");
		assert.equal(extractPlainText({} as never), "");
	});

	test("слишком глубокое дерево не обходится до дна", () => {
		let node: Record<string, unknown> = { text: "дно" };
		for (let i = 0; i < 40; i++) node = { type: "quote", children: [node] };
		assert.equal(extractPlainText({ root: node } as never), "");
	});
});

// ─── База знаний: видео ─────────────────────────────────────────────────────

describe("parseVideoUrl — что попадёт в iframe", () => {
	test("поддерживаемые сервисы — в канонический адрес встраивания", () => {
		const cases: [string, string][] = [
			[
				"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
				"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
			],
			[
				"https://youtu.be/dQw4w9WgXcQ",
				"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
			],
			[
				"https://m.youtube.com/shorts/abc_DEF-123",
				"https://www.youtube-nocookie.com/embed/abc_DEF-123?rel=0",
			],
			[
				"https://vimeo.com/123456789",
				"https://player.vimeo.com/video/123456789",
			],
			[
				"https://vk.com/video-123456_789012",
				"https://vk.com/video_ext.php?oid=-123456&id=789012",
			],
			[
				"https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=abc123",
				"https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123",
			],
			[
				"https://rutube.ru/video/0123456789abcdef0123456789abcdef/",
				"https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef/",
			],
		];
		for (const [raw, embed] of cases) {
			const parsed = parseVideoUrl(raw);
			assert.equal(parsed?.embedUrl, embed, raw);
			// Адрес встраивания — только из белого списка frame-src.
			assert.ok(
				ALLOWED_EMBED_FRAME_SRC.some((origin) =>
					parsed?.embedUrl.startsWith(`${origin}/`),
				),
				raw,
			);
		}
	});

	test("не https, чужой хост, мусор — нет видео", () => {
		for (const raw of [
			null,
			"",
			"не адрес",
			"http://www.youtube.com/watch?v=dQw4w9WgXcQ",
			"javascript:alert(1)//youtube.com/watch?v=x",
			"data:text/html,<script>alert(1)</script>",
			"https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
			"https://evil.example/?u=https://youtu.be/dQw4w9WgXcQ",
			"https://notyoutube.com/watch?v=dQw4w9WgXcQ",
			"https://vimeo.com/12345",
			"https://vk.com/club1",
			"https://rutube.ru/channel/1/",
		]) {
			assert.equal(parseVideoUrl(raw), null, String(raw));
		}
	});

	test("id с опасными символами не попадает в адрес", () => {
		assert.equal(
			parseVideoUrl('https://www.youtube.com/watch?v=abc"><script>'),
			null,
		);
		assert.equal(
			parseVideoUrl(`https://www.youtube.com/watch?v=${"a".repeat(65)}`),
			null,
		);
		// Плохой hash ВК отбрасывается, само видео остаётся.
		assert.equal(
			parseVideoUrl("https://vk.com/video_ext.php?oid=1&id=2&hash=<x>")
				?.embedUrl,
			"https://vk.com/video_ext.php?oid=1&id=2",
		);
		assert.equal(
			parseVideoUrl("https://vk.com/video_ext.php?oid=1x&id=2"),
			null,
		);
	});
});

// ─── База знаний: фильтры и поиск ───────────────────────────────────────────

describe("фильтры базы знаний из адреса", () => {
	test("корректные значения", () => {
		assert.deepEqual(
			parseKnowledgeSearchParams({
				q: "  сеть ",
				category: "setkomety",
				section: "uhod",
				page: "3",
			}),
			{ q: "сеть", category: "setkomety", section: "uhod", page: 3 },
		);
	});

	test("раздел без категории отбрасывается; мусор — значения по умолчанию", () => {
		assert.equal(parseKnowledgeSearchParams({ section: "uhod" }).section, null);
		const defaults = { q: "", category: null, section: null, page: 1 };
		for (const bad of [
			{ category: "../etc" },
			{ category: "a b" },
			{ page: "0" },
			{ page: "1000" },
			{ page: "2.5" },
			{ q: "x".repeat(201) },
			{ q: ["a", "b"] },
		]) {
			assert.deepEqual(
				parseKnowledgeSearchParams(bad),
				defaults,
				JSON.stringify(bad),
			);
		}
	});
});

describe("поиск по базе знаний", () => {
	test("запрос в tsquery — только слова, без операторов", () => {
		assert.equal(
			buildTsQuery("Сеть & (ёлка) | !уход:*"),
			"сеть:* & елка:* & уход:*",
		);
		assert.equal(buildTsQuery("а & !"), null);
		assert.equal(
			parseQueryTerms("один два три четыре пять шесть семь").length,
			6,
		);
		assert.equal(normalizeForSearch("  Ёж, ЁЛКА!  "), "еж елка");
	});

	test("основы для подсветки короче слова", () => {
		// Основа — слово без двух последних букв, но не короче трёх.
		assert.deepEqual(toHighlightStems("сетками уход ab"), [
			"сетка",
			"ухо",
			"ab",
		]);
	});

	test("фрагмент вокруг совпадения в теле статьи", () => {
		const body = `${"слово ".repeat(60)}сеткомёт ловит дрон ${"хвост ".repeat(60)}`;
		const snippet = buildSnippet(`Заголовок\u0007${body}`, ["сеткомет"]);
		assert.ok(snippet?.startsWith("…"));
		assert.ok(snippet?.endsWith("…"));
		assert.ok(snippet?.includes("сеткомёт"));
		assert.equal(buildSnippet("Заголовок\u0007 тело", ["нет"]), null);
		assert.equal(buildSnippet(null, ["x"]), null);
		assert.equal(buildSnippet("Заголовок\u0007   ", ["x"]), null);
	});

	test("подсветка: «ё», регистр, несколько терминов", () => {
		assert.deepEqual(splitByTerms("Ёлка и ЕЛКА", ["елка"]), [
			{ text: "Ёлка", match: true },
			{ text: " и ", match: false },
			{ text: "ЕЛКА", match: true },
		]);
		assert.deepEqual(splitByTerms("текст", []), [
			{ text: "текст", match: false },
		]);
		assert.deepEqual(
			splitByTerms("Сеть, уход", ["сеть", "уход"]).map((p) => p.match),
			[true, false, true],
		);
	});

	test("подсветка после эмодзи не съезжает", () => {
		assert.deepEqual(splitByTerms("🚀 сеть", ["сеть"]), [
			{ text: "🚀 ", match: false },
			{ text: "сеть", match: true },
		]);
	});
});

// ─── Обратная связь ─────────────────────────────────────────────────────────

describe("форма обратной связи", () => {
	const valid = {
		type: "question",
		title: "  Вопрос по заказу  ",
		description: "Подробное описание проблемы, больше двадцати символов",
		email: " client@example.test ",
	};

	test("корректная — с обрезкой пробелов", () => {
		const parsed = feedbackFormSchema.parse(valid);
		assert.equal(parsed.title, "Вопрос по заказу");
		assert.equal(parsed.email, "client@example.test");
	});

	test("границы длины, тип и почта", () => {
		const bad = (patch: Record<string, unknown>) =>
			!feedbackFormSchema.safeParse({ ...valid, ...patch }).success;
		assert.ok(bad({ type: "spam" }));
		assert.ok(bad({ title: "abcd" }));
		assert.ok(bad({ title: "x".repeat(FEEDBACK_LIMITS.title.max + 1) }));
		assert.ok(!bad({ title: "x".repeat(FEEDBACK_LIMITS.title.max) }));
		assert.ok(bad({ description: "  коротко  " }));
		assert.ok(
			bad({ description: "x".repeat(FEEDBACK_LIMITS.description.max + 1) }),
		);
		assert.ok(bad({ email: "" }));
		assert.ok(bad({ email: "не почта" }));
	});
});

// ─── Согласие на cookie ─────────────────────────────────────────────────────

describe("согласие на cookie", () => {
	const store = new Map<string, string>();
	(globalThis as { localStorage?: Storage }).localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => {
			store.set(k, v);
		},
		removeItem: (k: string) => {
			store.delete(k);
		},
		clear: () => store.clear(),
		key: () => null,
		length: 0,
	};
	(globalThis as { window?: unknown }).window ??= globalThis;

	const load = async () => {
		const config = await import(
			"../../src/modules/cookie-consent/lib/config.ts"
		);
		const mod = await import(
			`../../src/modules/cookie-consent/store/cookieConsent.store.ts?${Math.random()}`
		);
		await mod.useCookieConsentStore.persist.rehydrate();
		return { ...mod, config };
	};

	beforeEach(() => store.clear());

	test("пока выбора нет — баннер; выбор сохраняется без служебных полей", async () => {
		const { useCookieConsentStore, selectShouldShowBanner, config } =
			await load();
		const s = useCookieConsentStore.getState();
		assert.equal(selectShouldShowBanner(s), true);
		s.acceptEssentialOnly();
		assert.equal(
			selectShouldShowBanner(useCookieConsentStore.getState()),
			false,
		);
		const saved = JSON.parse(
			store.get(config.COOKIE_CONSENT_STORAGE_KEY) ?? "{}",
		);
		assert.equal(saved.state.analytics, false);
		assert.equal(saved.state.decided, true);
		assert.equal("hasHydrated" in saved.state, false);
		useCookieConsentStore.getState().save({ analytics: true });
		assert.equal(useCookieConsentStore.getState().analytics, true);
		useCookieConsentStore.getState().reopen();
		assert.equal(useCookieConsentStore.getState().decided, false);
	});

	test("выбор под старую редакцию политики — спрашиваем снова", async () => {
		const config = await import(
			"../../src/modules/cookie-consent/lib/config.ts"
		);
		store.set(
			config.COOKIE_CONSENT_STORAGE_KEY,
			JSON.stringify({
				state: {
					decided: true,
					analytics: true,
					version: config.COOKIE_CONSENT_VERSION - 1,
					decidedAt: "2026-01-01T00:00:00Z",
				},
				version: 0,
			}),
		);
		const { useCookieConsentStore, selectShouldShowBanner } = await load();
		const s = useCookieConsentStore.getState();
		assert.equal(s.decided, false);
		assert.equal(s.analytics, false);
		assert.equal(selectShouldShowBanner(s), true);
	});

	test("действующий выбор поднимается из хранилища", async () => {
		const config = await import(
			"../../src/modules/cookie-consent/lib/config.ts"
		);
		store.set(
			config.COOKIE_CONSENT_STORAGE_KEY,
			JSON.stringify({
				state: {
					decided: true,
					analytics: true,
					version: config.COOKIE_CONSENT_VERSION,
					decidedAt: "2026-01-01T00:00:00Z",
				},
				version: 0,
			}),
		);
		const { useCookieConsentStore, selectShouldShowBanner } = await load();
		assert.equal(useCookieConsentStore.getState().analytics, true);
		assert.equal(
			selectShouldShowBanner(useCookieConsentStore.getState()),
			false,
		);
	});
});
