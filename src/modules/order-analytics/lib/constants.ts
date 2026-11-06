/**
 * Словари аналитики заказов. Модуль чистый (ни базы, ни React): его читают и
 * серверные запросы, и страница в админке.
 *
 * Правило «что считается продажей» здесь одно на весь раздел и повторяет уже
 * принятое в проекте: отменённый и возвращённый заказ покупкой не считается
 * (Orders.ts → isVoidOrderStatus, banners/server/facts.ts → VOID_ORDER_STATUSES).
 */

/** Пояс, в котором заказ относится к дню, неделе и месяцу. */
export const ANALYTICS_TIMEZONE = "Europe/Moscow";

export const ORDER_STATUSES = [
	"pending",
	"awaiting_invoice",
	"confirmed",
	"processing",
	"packed",
	"shipped",
	"ready_for_pickup",
	"delivered",
	"cancelled",
	"refunded",
] as const;
export type AnalyticsOrderStatus = (typeof ORDER_STATUSES)[number];

/** Сделки не было: в продажи и выручку не входят. */
export const VOID_STATUSES = ["cancelled", "refunded"] as const;

/** Заказ ещё в работе — не завершён и не отменён. */
export const OPEN_STATUSES = [
	"pending",
	"awaiting_invoice",
	"confirmed",
	"processing",
	"packed",
	"shipped",
	"ready_for_pickup",
] as const;

/** Группы для фильтра статуса (вместе с отдельными статусами). */
export const STATUS_GROUPS = {
	valid: [...OPEN_STATUSES, "delivered"],
	open: OPEN_STATUSES,
	void: VOID_STATUSES,
} as const;
export type StatusGroup = keyof typeof STATUS_GROUPS;

/**
 * Этапы обработки заказа. Разные способы получения идут разными статусами
 * (modules/orders/lib/status-flow.ts), поэтому статусы одного смысла сведены в
 * один этап: «упакован» — та же сборка, «отправлен» и «готов к выдаче» — заказ
 * уже покинул склад. Ожидание счёта стоит до подтверждения, это ещё этап
 * оформления.
 */
export const FUNNEL_STAGES = [
	{
		key: "placed",
		label: "Оформлен",
		statuses: ["pending", "awaiting_invoice"],
	},
	{ key: "confirmed", label: "Подтверждён", statuses: ["confirmed"] },
	{ key: "assembly", label: "Сборка", statuses: ["processing", "packed"] },
	{
		key: "handover",
		label: "Отправлен / готов к выдаче",
		statuses: ["shipped", "ready_for_pickup"],
	},
	{ key: "delivered", label: "Получен", statuses: ["delivered"] },
] as const;

export const CUSTOMER_TYPES = [
	"individual",
	"sole_proprietor",
	"legal",
	"company_unknown",
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
	individual: "Физические лица",
	sole_proprietor: "ИП",
	legal: "Юридические лица",
	company_unknown: "Организация, тип не определён",
};

export const DELIVERY_METHODS = [
	"door_to_door",
	"pickup_point",
	"self_pickup",
] as const;
export const DELIVERY_LABELS: Record<
	(typeof DELIVERY_METHODS)[number],
	string
> = {
	door_to_door: "Курьер до двери",
	pickup_point: "ПВЗ транспортной компании",
	self_pickup: "Самовывоз",
};

export const PAYMENT_METHODS = [
	"invoice",
	"self_pickup_card",
	"self_pickup_cash",
] as const;
export const PAYMENT_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> =
	{
		invoice: "По счёту",
		self_pickup_card: "Картой при самовывозе",
		self_pickup_cash: "Наличными при самовывозе",
	};

export const PAYMENT_STATUSES = [
	"pending",
	"paid",
	"failed",
	"refunded",
] as const;
export const PAYMENT_STATUS_LABELS: Record<
	(typeof PAYMENT_STATUSES)[number],
	string
> = {
	pending: "Ожидает оплаты",
	paid: "Оплачен",
	failed: "Ошибка оплаты",
	refunded: "Возврат",
};

export const SOURCES = ["web", "mobile", "admin"] as const;
export const SOURCE_LABELS: Record<(typeof SOURCES)[number], string> = {
	web: "Сайт",
	mobile: "Мобильное",
	admin: "Админка",
};

/** Служебные значения региона: у таких заказов региона доставки нет. */
export const REGION_PICKUP = "__pickup";
export const REGION_UNKNOWN = "__unknown";
export const REGION_SPECIAL_LABELS: Record<string, string> = {
	[REGION_PICKUP]: "Самовывоз",
	[REGION_UNKNOWN]: "Регион не указан",
};

export const SECTIONS = [
	"meta",
	"overview",
	"products",
	"product_table",
	"geo",
	"customers",
	"funnel",
] as const;
export type AnalyticsSection = (typeof SECTIONS)[number];

export const PERIODS = [
	{ key: "7d", label: "7 дней" },
	{ key: "30d", label: "30 дней" },
	{ key: "90d", label: "90 дней" },
	{ key: "365d", label: "12 месяцев" },
	{ key: "mtd", label: "Этот месяц" },
	{ key: "last_month", label: "Прошлый месяц" },
	{ key: "qtd", label: "Этот квартал" },
	{ key: "ytd", label: "Этот год" },
	{ key: "last_year", label: "Прошлый год" },
	{ key: "all", label: "Всё время" },
	{ key: "custom", label: "Свой период" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export const COMPARE_MODES = [
	{ key: "previous", label: "С предыдущим периодом" },
	{ key: "year", label: "С прошлым годом" },
	{ key: "none", label: "Без сравнения" },
] as const;
export type CompareMode = (typeof COMPARE_MODES)[number]["key"];

export const GRANULARITIES = [
	{ key: "auto", label: "Авто" },
	{ key: "day", label: "По дням" },
	{ key: "week", label: "По неделям" },
	{ key: "month", label: "По месяцам" },
] as const;
export type GranularityChoice = (typeof GRANULARITIES)[number]["key"];
export type Granularity = Exclude<GranularityChoice, "auto">;

export const PRODUCT_SORTS = [
	"revenue",
	"units",
	"orders",
	"customers",
	"avgPrice",
	"voidUnits",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_PAGE_SIZE = 25;

/** Границы классов ABC по доле накопленной товарной выручки. */
export const ABC_A_SHARE = 0.8;
export const ABC_B_SHARE = 0.95;
