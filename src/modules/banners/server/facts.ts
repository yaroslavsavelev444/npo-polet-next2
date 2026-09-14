import { sql } from "@payloadcms/db-postgres";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { reviewInvitationSource } from "@/payload/services/reviews.service";
import type { BannerAudienceFacts, BannerTrackedAction } from "../conditions";

// Сбор фактов о пользователе — ОДИН ПРОХОД НА ОДНО РЕШЕНИЕ.
//
// ─── Почему всё сразу, а не по требованию ──────────────────────────────────
//
// Ленивое чтение «спросим, только если условие спросит» выглядит экономнее и
// на деле дороже: у баннеров условия пересекаются (заказы спрашивают трое,
// корзину — двое), и ленивая схема либо повторяет запрос, либо заводит кэш,
// который придётся инвалидировать. Здесь стоимость решения ПОСТОЯННА и не
// зависит ни от числа баннеров, ни от их условий.
//
// ─── Почему один SQL, а не десять payload.find ─────────────────────────────
//
// Фактов девять, и каждый — это агрегат по чужой таблице: сумма корзины,
// количество заказов по статусам, доставленные товары без отзыва. Через Local
// API это десять раздельных запросов, из которых половина тянет документы
// целиком ради того, чтобы посчитать их длину (`getCartItemCount` именно так
// и устроен — он читает корзину с `depth: 2` ради одного числа, и для бейджа в
// шапке это нормально, а для прохода по всем баннерам — нет).
//
// Прямой drizzle здесь — не исключение из архитектуры, а уже существующий в
// проекте приём: ровно так же считается `getUserReviewStats`
// (`reviews.service.ts`), и по той же причине — агрегаты по одной таблице
// дешевле посчитать в базе, чем вычитать строки в Node.
//
// ─── Почему `null`, а не «ноль» ────────────────────────────────────────────
//
// Неудавшееся чтение отдаёт `null` («фактов нет»), и тогда баннеры не
// показываются вовсе. Условие с неизвестным фактом не выполняется
// (`conditions.ts`), и это ровно то поведение, которое нужно: сбой чтения
// заказов обязан означать «не показывать баннер про заказы», а не «показать
// всем баннер „оформите первый заказ“».

/** Заказы, которые считаются «в работе»: деньги уже в процессе, товар ещё в пути. */
const ACTIVE_ORDER_STATUSES = [
	"pending",
	"confirmed",
	"processing",
	"packed",
	"shipped",
	"ready_for_pickup",
	"awaiting_invoice",
] as const;

/** Отменённые и возвращённые заказы не считаются ни за что: сделки не было. */
const VOID_ORDER_STATUSES = ["cancelled", "refunded"] as const;

type FactRow = Record<string, unknown>;

function num(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Всё, что нужно знать о пользователе, чтобы отобрать ему баннеры.
 *
 * Возвращает `null`, когда баннеры этому аккаунту не положены вовсе, —
 * заблокирован, приостановлен или не существует. Проверка статуса здесь
 * дублирует `getAuthenticatedUserFromHeaders`, и намеренно: отбор вызывается и
 * из записи событий, где пользователь был опознан минутами раньше, а
 * администратор мог заблокировать его в этом промежутке. Показывать
 * «Возвращайтесь за покупками» человеку, чей аккаунт мы сами и заблокировали,
 * — сбой, который он видит раньше нас.
 */
export async function collectAudienceFacts(
	userId: number,
	now: Date = new Date(),
): Promise<BannerAudienceFacts | null> {
	const payload = await getPayloadInstance();

	try {
		const result = (await payload.db.drizzle.execute(sql`
			WITH me AS (
				SELECT id, created_at, email_verified
				FROM users
				WHERE id = ${userId} AND status = 'active'
			),
			order_stats AS (
				SELECT
					COUNT(*) FILTER (
						WHERE status NOT IN ${sql.raw(inList(VOID_ORDER_STATUSES))}
					)::int AS total_orders,
					COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_orders,
					COUNT(*) FILTER (
						WHERE status IN ${sql.raw(inList(ACTIVE_ORDER_STATUSES))}
					)::int AS active_orders,
					MAX(created_at) FILTER (
						WHERE status NOT IN ${sql.raw(inList(VOID_ORDER_STATUSES))}
					) AS last_order_at,
					MAX(created_at) FILTER (WHERE status = 'delivered') AS last_delivered_at
				FROM orders
				WHERE user_id = ${userId}
			),
			cart_stats AS (
				SELECT
					COUNT(ci.id)::int AS cart_items,
					COALESCE(
						SUM(COALESCE(p.pricing_price_for_individual, 0) * ci.quantity),
						0
					)::float AS cart_total,
					MAX(ci.added_at) AS cart_touched_at
				FROM carts c
				JOIN carts_items ci ON ci._parent_id = c.id
				LEFT JOIN products p ON p.id = ci.product_id
				WHERE c.user_id = ${userId}
			),
			wishlist_stats AS (
				SELECT
					COUNT(wi.id)::int AS wishlist_items,
					MAX(wi.added_at) AS last_wishlist_at
				FROM wishlists w
				JOIN wishlists_items wi ON wi._parent_id = w.id
				WHERE w.user_id = ${userId}
			),
			review_stats AS (
				SELECT
					COUNT(*)::int AS reviews_written,
					MAX(created_at) AS last_review_at
				FROM product_reviews
				WHERE user_id = ${userId}
			),
			-- Доставленные товары, на которые отзыва ещё нет.
			--
			-- Условия берутся из reviewInvitationSource — того же запроса, что
			-- наполняет раздел «Можно оценить» в кабинете. Своей копии условий
			-- здесь больше нет намеренно: она была, и в ней не хватало проверки
			-- доступности товара, из-за чего баннер считал в том числе снятые с
			-- продажи покупки и мог позвать оценить туда, где раздел пуст. Это
			-- ровно та поломка, от которой предостерегал комментарий на месте
			-- прежней копии, — разошлись именно те два определения.
			pending_review_stats AS (
				SELECT COUNT(DISTINCT oi.product_id)::int AS pending_reviews
				${reviewInvitationSource(userId)}
			),
			promo_stats AS (
				SELECT MAX(created_at) AS last_promo_at
				FROM promo_code_redemptions
				WHERE user_id = ${userId} AND status = 'applied'
			)
			SELECT
				me.created_at,
				me.email_verified,
				order_stats.*,
				cart_stats.*,
				wishlist_stats.*,
				review_stats.*,
				pending_review_stats.*,
				promo_stats.*
			FROM me, order_stats, cart_stats, wishlist_stats, review_stats,
				pending_review_stats, promo_stats
		`)) as { rows?: FactRow[] };

		const row = result.rows?.[0];

		// Строки нет — аккаунта нет или он не активен: `me` пуст, и CROSS JOIN с
		// пустым набором даёт пустой результат целиком. Это и есть ответ «баннеры
		// не положены», а не «фактов ноль».
		if (!row) return null;

		return {
			accountAgeDays: daysSince(row.created_at, now) ?? 0,
			emailVerified: row.email_verified === true,
			totalOrders: num(row.total_orders),
			deliveredOrders: num(row.delivered_orders),
			activeOrders: num(row.active_orders),
			daysSinceLastOrder: daysSince(row.last_order_at, now),
			cartItems: num(row.cart_items),
			cartTotal: num(row.cart_total),
			// Часы, а не сутки: забытая корзина — вопрос одного дня, и мерить его
			// сутками значит не уметь отличить «положил час назад» от «положил
			// вчера вечером».
			cartIdleHours:
				num(row.cart_items) > 0 ? hoursSince(row.cart_touched_at, now) : null,
			wishlistItems: num(row.wishlist_items),
			reviewsWritten: num(row.reviews_written),
			pendingReviews: num(row.pending_reviews),
			actionAgeDays: collectActionAges(row, now),
		};
	} catch (error) {
		// Никаких умолчаний: не сумев прочитать факты, система не показывает
		// баннеров вовсе. Это дороже для продукта и дешевле для покупателя, чем
		// баннер, выбранный по выдуманным данным.
		console.error("[banners] Не удалось собрать факты о пользователе:", error);
		return null;
	}
}

/**
 * Даты действий — из тех же агрегатов, что и счётчики.
 *
 * ─── Почему из существующих таблиц, а не из своего журнала ─────────────────
 *
 * Соблазн завести таблицу «событий пользователя» здесь силён и ошибочен: даты
 * уже лежат в тех же строках, ради которых события и происходили — заказ
 * знает, когда его оформили, отзыв знает, когда его написали. Отдельный журнал
 * был бы ВТОРОЙ копией этих фактов, которую надо синхронно пополнять из пяти
 * мест, и первое же пропущенное место дало бы баннер, показанный «за не
 * совершённое» действие, которое на самом деле совершено.
 */
function collectActionAges(
	row: FactRow,
	now: Date,
): Partial<Record<BannerTrackedAction, number>> {
	const ages: Partial<Record<BannerTrackedAction, number>> = {};

	const sources: [BannerTrackedAction, unknown][] = [
		["order_placed", row.last_order_at],
		["order_delivered", row.last_delivered_at],
		["review_left", row.last_review_at],
		["promo_code_used", row.last_promo_at],
		["wishlist_item_added", row.last_wishlist_at],
	];

	for (const [action, at] of sources) {
		const age = daysSince(at, now);
		// Ключ не появляется, когда даты нет, — то есть действие читается как
		// «не совершал». Ноль означал бы «совершил только что», и условие «не
		// заказывал 90 дней» никогда бы не выполнилось у того, кто не заказывал
		// вовсе.
		if (age !== null) ages[action] = age;
	}

	return ages;
}

function toDate(value: unknown): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value: unknown, now: Date): number | null {
	const date = toDate(value);
	if (!date) return null;
	return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function hoursSince(value: unknown, now: Date): number | null {
	const date = toDate(value);
	if (!date) return null;
	return Math.max(0, (now.getTime() - date.getTime()) / 3_600_000);
}

/**
 * Список статусов в литерал SQL.
 *
 * Значения — константы этого файла, а не пользовательский ввод, поэтому
 * подстановка безопасна; параметризовать `IN`-список драйвером пришлось бы
 * поштучно и ради того же результата. Кавычка экранируется всё равно: правило
 * «строка собирается из констант» живёт до первой правки, которая этого не
 * заметит.
 */
function inList(values: readonly string[]): string {
	return `(${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ")})`;
}
