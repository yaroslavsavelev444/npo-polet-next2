/**
 * Словарь модуля «чат с менеджером», общий для коллекций Payload, сервера,
 * шлюза и (позже) клиента. Без серверных импортов: файл попадёт в клиентский
 * бандл виджета.
 *
 * Значения перечислений совпадают с enum в базе
 * (src/migrations/20261011_120000_support_chat.ts) — переименование здесь
 * требует миграции.
 */

export const SUPPORT_TOPICS = [
	{ value: "order", label: "Заказ" },
	{ value: "product", label: "Товар" },
	{ value: "documents", label: "Документы и сертификаты" },
	{ value: "delivery", label: "Доставка" },
	{ value: "payment", label: "Оплата" },
	{ value: "other", label: "Другое" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];

export const SUPPORT_TOPIC_VALUES = SUPPORT_TOPICS.map((t) => t.value) as [
	SupportTopic,
	...SupportTopic[],
];

export type ConversationStatus = "open" | "resolved";
export type ConversationPriority = "normal" | "high";
export type MessageAuthorType = "customer" | "staff" | "system";
/** `note` — внутренняя заметка персонала: покупателю не отдаётся никогда. */
export type MessageKind = "text" | "note" | "system";
export type CannedScope = "shared" | "personal";
export type RoutingMode = "auto" | "manual";
export type AgentStatus = "available" | "away" | "offline";

export const WEEKDAYS = [
	{ value: "mon", label: "Понедельник" },
	{ value: "tue", label: "Вторник" },
	{ value: "wed", label: "Среда" },
	{ value: "thu", label: "Четверг" },
	{ value: "fri", label: "Пятница" },
	{ value: "sat", label: "Суббота" },
	{ value: "sun", label: "Воскресенье" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["value"];

// ─── Ограничения ────────────────────────────────────────────────────────────

/** Длина одного сообщения в символах. */
export const MESSAGE_MAX_LENGTH = 4000;
/** Вложений в одном сообщении. */
export const MESSAGE_MAX_ATTACHMENTS = 5;
/** Размер одного вложения. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Комментарий к оценке диалога. */
export const CSAT_COMMENT_MAX_LENGTH = 1000;
/** Меток на диалоге и длина одной метки. */
export const TAGS_MAX = 10;
export const TAG_MAX_LENGTH = 40;
/** Сообщений за один запрос истории. */
export const HISTORY_PAGE_SIZE = 50;
/** Сообщений за одну досинхронизацию после разрыва. */
export const SYNC_MAX_MESSAGES = 200;

/**
 * Типы вложений — белый список. Без HEIC: sharp из npm не декодирует HEVC, а
 * iOS при выборе фото в браузере и так отдаёт JPEG. Без SVG и архивов — по
 * тем же причинам, что и в Media (активное содержимое, непроверяемое нутро).
 */
export const ATTACHMENT_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** Отчёт «подсказывается, но не используется»: меньше подсказок — доля ещё ничего не значит. */
export const CANNED_UNDERUSED_MIN_SUGGESTIONS = 5;
/** …и вставляют реже, чем в каждой пятой подсказке. */
export const CANNED_UNDERUSED_MAX_RATIO = 0.2;

/**
 * Документ согласия, который принимают, начиная чат: Согласие на обработку
 * ПД — тот же, что у формы контактов (PERSONAL_DATA_CONSENT_SLUG в
 * modules/contact). Другой slug сервер не принимает: иначе «согласием» мог
 * бы стать любой действующий документ, например согласие на cookie.
 */
export const SUPPORT_CONSENT_SLUG = "personal-data";
