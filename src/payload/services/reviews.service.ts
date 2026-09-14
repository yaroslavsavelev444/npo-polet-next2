import { sql } from "@payloadcms/db-postgres";
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type {
	Media,
	Product,
	ProductReview,
	User,
} from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";
import {
	noReviewYet,
	PRODUCT_STILL_ON_SALE,
} from "./review-eligibility";

/**
 * Сервис отзывов о товарах.
 *
 * Публичные страницы показывают только отзывы со статусом `approved`
 * (модерация — в коллекции product-reviews, см. Reviews.ts). Средний рейтинг
 * и количество отзывов агрегируются прямым SQL по индексам
 * (product_reviews_product_idx + product_reviews_status_idx), а не выборкой
 * всех документов: это масштабируется на товары с тысячами отзывов и на
 * листинг каталога, где рейтинг нужен сразу для десятков карточек.
 */

const APPROVED = "approved" as const;
const DELIVERED_STATUS = "delivered" as const;

export interface RatingAggregate {
	/** Средняя оценка (0, если отзывов нет). */
	average: number;
	/** Количество одобренных отзывов. */
	count: number;
}

export interface RatingBreakdown extends RatingAggregate {
	/** Сколько отзывов приходится на каждую оценку: distribution[5]..distribution[1]. */
	distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ReviewView {
	id: string;
	rating: number;
	title: string | null;
	comment: string;
	authorName: string;
	isVerifiedPurchase: boolean;
	createdAt: string;
}

export interface ReviewsPage {
	reviews: ReviewView[];
	totalDocs: number;
	page: number;
	totalPages: number;
	hasNextPage: boolean;
}

type DrizzleRows = { rows?: Record<string, unknown>[] };

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Публичное имя автора отзыва: имя целиком, но фамилия сокращается до
 * инициала («Иван П.»), чтобы не публиковать полное ФИО покупателя.
 */
function formatAuthorName(user: number | User | null | undefined): string {
	if (!user || typeof user !== "object") return "Пользователь";
	const raw = (user.name ?? "").trim();
	if (!raw) return "Пользователь";
	const [first, ...rest] = raw.split(/\s+/);
	if (rest.length === 0) return first;
	const lastInitial = rest[rest.length - 1]?.[0];
	return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

function mapReview(doc: ProductReview): ReviewView {
	return {
		id: String(doc.id),
		rating: toNumber(doc.rating),
		title: doc.title?.trim() || null,
		comment: doc.comment,
		authorName: formatAuthorName(doc.user),
		isVerifiedPurchase: Boolean(doc.isVerifiedPurchase),
		createdAt: doc.createdAt,
	};
}

/** Средний рейтинг + количество одобренных отзывов для ОДНОГО товара. */
export async function getProductRatingBreakdown(
	productId: string | number,
): Promise<RatingBreakdown> {
	const payload = await getPayloadInstance();
	const result = (await payload.db.drizzle.execute(sql`
		SELECT
			COALESCE(AVG(rating), 0)::float AS average,
			COUNT(*)::int AS count,
			COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
			COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
			COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
			COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
			COUNT(*) FILTER (WHERE rating = 1)::int AS r1
		FROM product_reviews
		WHERE product_id = ${Number(productId)} AND status = ${APPROVED}
	`)) as DrizzleRows;

	const row = result.rows?.[0] ?? {};
	return {
		average: toNumber(row.average),
		count: toNumber(row.count),
		distribution: {
			5: toNumber(row.r5),
			4: toNumber(row.r4),
			3: toNumber(row.r3),
			2: toNumber(row.r2),
			1: toNumber(row.r1),
		},
	};
}

/**
 * Агрегаты рейтинга сразу для набора товаров — ОДНИМ группированным запросом,
 * без N+1. Используется листингом каталога и блоком похожих товаров, чтобы
 * показать рейтинг на карточках. Отсутствующий в Map товар = отзывов нет.
 */
export async function getRatingAggregatesForProducts(
	productIds: (string | number)[],
): Promise<Map<string, RatingAggregate>> {
	const ids = productIds.map(Number).filter((n) => Number.isFinite(n));
	const map = new Map<string, RatingAggregate>();
	if (ids.length === 0) return map;

	const payload = await getPayloadInstance();
	// drizzle разворачивает JS-массив в кортеж параметров ($2, $3, …), поэтому
	// `= ANY(${ids}::int[])` собирается в невалидный `ANY(($2,$3,...)::int[])`
	// и падает в рантайме. Строим явный список через sql.join → `IN ($2,$3,…)`:
	// каждый id остаётся отдельным биндом (без конкатенации в строку — SQL-
	// инъекции невозможны), а сам список — валидный.
	const idList = sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `,
	);
	const result = (await payload.db.drizzle.execute(sql`
		SELECT
			product_id,
			AVG(rating)::float AS average,
			COUNT(*)::int AS count
		FROM product_reviews
		WHERE status = ${APPROVED} AND product_id IN (${idList})
		GROUP BY product_id
	`)) as DrizzleRows;

	for (const row of result.rows ?? []) {
		map.set(String(row.product_id), {
			average: toNumber(row.average),
			count: toNumber(row.count),
		});
	}
	return map;
}

/** Одобренные отзывы товара с пагинацией (свежие сверху). */
export async function getApprovedReviewsForProduct(
	productId: string | number,
	options: { page?: number; limit?: number } = {},
): Promise<ReviewsPage> {
	const payload = await getPayloadInstance();
	const { page = 1, limit = 10 } = options;

	const result = await payload.find({
		collection: "product-reviews",
		where: {
			and: [
				{ product: { equals: Number(productId) } },
				{ status: { equals: APPROVED } },
			],
		},
		sort: "-createdAt",
		page,
		limit,
		depth: 1,
		overrideAccess: true,
	});

	return {
		reviews: (result.docs as unknown as ProductReview[]).map(mapReview),
		totalDocs: result.totalDocs,
		page: result.page ?? page,
		totalPages: result.totalPages,
		hasNextPage: result.hasNextPage,
	};
}

/**
 * Последние одобренные отзывы по ВСЕМУ каталогу — для блока доверия на
 * главной.
 *
 * Отличается от getApprovedReviewsForProduct тем, что не фильтрует по товару и
 * дополнительно отдаёт название товара: вне карточки товара отзыв без
 * указания, о чём он, бесполезен.
 *
 * Кэшируется тегом "reviews" — тем же, который сбрасывает хук коллекции при
 * одобрении отзыва, поэтому свежий отзыв появляется на главной сразу, а не
 * после редеплоя. В разработке кэш обходится: иначе правки в админке не видны.
 */
export interface HomepageReview extends ReviewView {
	productTitle: string | null;
	productHref: string | null;
}

async function fetchLatestApprovedReviews(
	limit: number,
): Promise<HomepageReview[]> {
	const payload = await getPayloadInstance();

	const result = await payload.find({
		collection: "product-reviews",
		where: {
			and: [
				{ status: { equals: APPROVED } },
				// Пустой комментарий встречается: оценку можно поставить без
				// текста. В витрине такой отзыв — пустая карточка.
				{ comment: { not_equals: "" } },
			],
		},
		sort: "-createdAt",
		limit,
		// depth 2: нужен и сам товар, и его категория — из неё строится ссылка.
		depth: 2,
		overrideAccess: true,
	});

	return (result.docs as unknown as ProductReview[]).map((doc) => {
		const product = typeof doc.product === "object" ? doc.product : null;
		const category =
			product && typeof product.category === "object" ? product.category : null;

		return {
			...mapReview(doc),
			productTitle: product?.title ?? null,
			productHref:
				product?.slug && category?.slug
					? `/category/${category.slug}/products/${product.slug}`
					: null,
		};
	});
}

export const getLatestApprovedReviews = (limit = 3) => {
	if (env.NODE_ENV === "development") {
		return fetchLatestApprovedReviews(limit);
	}
	return unstable_cache(
		() => fetchLatestApprovedReviews(limit),
		[`latest-approved-reviews-${limit}`],
		{ tags: ["reviews"], revalidate: false },
	)();
};

/** Существующий отзыв пользователя на товар (в любом статусе) или null. */
export async function getUserReviewForProduct(
	userId: string | number,
	productId: string | number,
): Promise<ProductReview | null> {
	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "product-reviews",
		where: {
			and: [
				{ user: { equals: Number(userId) } },
				{ product: { equals: Number(productId) } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	return (docs[0] as unknown as ProductReview) ?? null;
}

/**
 * Купил ли пользователь этот товар в ЗАВЕРШЁННОМ заказе. Финальный статус
 * заказа — `delivered` (см. Orders.ts / status.groups.ts: группа
 * «Завершённые»). Только он даёт право оставить отзыв.
 */
export async function hasUserPurchasedProduct(
	userId: string | number,
	productId: string | number,
): Promise<boolean> {
	const payload = await getPayloadInstance();
	const { totalDocs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ user: { equals: Number(userId) } },
				{ status: { equals: DELIVERED_STATUS } },
				{ "items.product": { equals: Number(productId) } },
			],
		},
		limit: 0,
		depth: 0,
		overrideAccess: true,
	});
	return totalDocs > 0;
}

export type ReviewEligibilityReason =
	| "eligible"
	| "not_authenticated"
	| "not_purchased"
	| "already_reviewed";

export interface ReviewEligibility {
	canReview: boolean;
	reason: ReviewEligibilityReason;
	/** Статус уже существующего отзыва пользователя, если он есть. */
	existingReviewStatus: NonNullable<ProductReview["status"]> | null;
}

/**
 * Единая проверка права оставить отзыв. Пользователь может оставить отзыв,
 * если он авторизован, купил товар в завершённом заказе и ещё не оставлял
 * отзыв на этот товар (один отзыв на товар — гарантируется и хуком коллекции).
 */
export async function getReviewEligibility(
	userId: string | number | null | undefined,
	productId: string | number,
): Promise<ReviewEligibility> {
	if (!userId) {
		return {
			canReview: false,
			reason: "not_authenticated",
			existingReviewStatus: null,
		};
	}

	const existing = await getUserReviewForProduct(userId, productId);
	if (existing) {
		return {
			canReview: false,
			reason: "already_reviewed",
			existingReviewStatus: existing.status ?? "pending",
		};
	}

	const purchased = await hasUserPurchasedProduct(userId, productId);
	if (!purchased) {
		return {
			canReview: false,
			reason: "not_purchased",
			existingReviewStatus: null,
		};
	}

	return { canReview: true, reason: "eligible", existingReviewStatus: null };
}

/* ===========================================================================
   Отзывы вне карточки товара
   ===========================================================================
   Две выборки: публичная лента «Наши отзывы» (все одобренные отзывы каталога)
   и личный список «Мои отзывы» (отзывы одного пользователя в любом статусе).

   Обе отдают отзыв ВМЕСТЕ с товаром: вне страницы товара отзыв без указания,
   о чём он, бесполезен. Глубина 2 — товар (уровень 1) и его категория с
   изображениями (уровень 2): из категории строится ссылка, из первого
   изображения — миниатюра.                                                  */

/** Товар, о котором отзыв, — ровно то, что нужно для опознания. */
export interface ReviewProductRef {
	id: string;
	title: string;
	href: string | null;
	imageUrl: string | null;
	imageAlt: string;
}

export interface PublicReviewView extends ReviewView {
	product: ReviewProductRef | null;
}

export interface PublicReviewsFeed {
	reviews: PublicReviewView[];
	totalDocs: number;
	page: number;
	totalPages: number;
	hasNextPage: boolean;
}

function mapProductRef(
	product: Product | number | null | undefined,
): ReviewProductRef | null {
	if (!product || typeof product !== "object") return null;

	const category =
		typeof product.category === "object" && product.category !== null
			? product.category
			: null;

	const firstImage = product.images?.find(
		(image): image is Media => typeof image === "object" && image !== null,
	);

	return {
		id: String(product.id),
		title: product.title,
		href:
			product.slug && category?.slug
				? `/category/${category.slug}/products/${product.slug}`
				: null,
		imageUrl: firstImage?.url ?? null,
		imageAlt: firstImage?.alt || product.title,
	};
}

/**
 * Сводный рейтинг по ВСЕМУ каталогу — средняя оценка, число отзывов и
 * распределение по звёздам.
 *
 * Считается тем же прямым SQL по индексу product_reviews_status_idx, что и
 * рейтинг одного товара: выбирать тысячи документов ради пяти чисел нельзя.
 *
 * Считаются ВСЕ одобренные отзывы, включая те немногие, что могли остаться
 * без текста, — ровно так же, как на карточке товара. Иначе средняя оценка на
 * публичной странице отличалась бы от средней на странице товара, и это
 * читалось бы как ошибка.
 */
async function fetchGlobalRatingBreakdown(): Promise<RatingBreakdown> {
	const payload = await getPayloadInstance();
	const result = (await payload.db.drizzle.execute(sql`
		SELECT
			COALESCE(AVG(rating), 0)::float AS average,
			COUNT(*)::int AS count,
			COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
			COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
			COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
			COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
			COUNT(*) FILTER (WHERE rating = 1)::int AS r1
		FROM product_reviews
		WHERE status = ${APPROVED}
	`)) as DrizzleRows;

	const row = result.rows?.[0] ?? {};
	return {
		average: toNumber(row.average),
		count: toNumber(row.count),
		distribution: {
			5: toNumber(row.r5),
			4: toNumber(row.r4),
			3: toNumber(row.r3),
			2: toNumber(row.r2),
			1: toNumber(row.r1),
		},
	};
}

export const getGlobalRatingBreakdown = () => {
	if (env.NODE_ENV === "development") {
		return fetchGlobalRatingBreakdown();
	}
	return unstable_cache(
		fetchGlobalRatingBreakdown,
		["global-rating-breakdown"],
		{
			tags: ["reviews"],
			revalidate: false,
		},
	)();
};

/**
 * Лента одобренных отзывов по всему каталогу.
 *
 * Только `approved` — тот же фильтр, что у отзывов на странице товара и что
 * записан в access коллекции. Ни `pending`, ни `rejected` сюда попасть не
 * могут: статус проверяется здесь, а не полагается на права запроса.
 *
 * Отзывы без текста отсеиваются: поле comment у коллекции обязательное, но
 * исторические записи бывают пустыми, а пустая карточка в публичной ленте
 * выглядит поломкой.
 */
export async function getApprovedReviewsFeed(
	options: { page?: number; limit?: number; rating?: number | null } = {},
): Promise<PublicReviewsFeed> {
	const payload = await getPayloadInstance();
	const { page = 1, limit = 12, rating = null } = options;

	const conditions: Where[] = [
		{ status: { equals: APPROVED } },
		{ comment: { not_equals: "" } },
	];
	if (rating && rating >= 1 && rating <= 5) {
		conditions.push({ rating: { equals: rating } });
	}

	const result = await payload.find({
		collection: "product-reviews",
		where: { and: conditions },
		sort: "-createdAt",
		page,
		limit,
		depth: 2,
		overrideAccess: true,
	});

	return {
		reviews: (result.docs as unknown as ProductReview[]).map((doc) => ({
			...mapReview(doc),
			product: mapProductRef(doc.product),
		})),
		totalDocs: result.totalDocs,
		page: result.page ?? page,
		totalPages: result.totalPages,
		hasNextPage: result.hasNextPage,
	};
}

/* ---------------------------------------------------------------------------
   Мои отзывы
   ---------------------------------------------------------------------------
   Автор видит свои отзывы в ЛЮБОМ статусе — иначе он не может убедиться, что
   отзыв принят на модерацию, и не узнает причину отклонения. Это же правило
   записано в access коллекции (Reviews.ts).

   Здесь, в отличие от публичной выборки, имя автора не сокращается и не
   показывается вовсе: пользователь читает собственные отзывы.              */

export type ReviewStatus = NonNullable<ProductReview["status"]>;

export interface MyReviewView {
	id: string;
	rating: number;
	title: string | null;
	comment: string;
	pros: string[];
	cons: string[];
	status: ReviewStatus;
	/** Заполняется модератором при отклонении — объясняет, что не так. */
	rejectionReason: string | null;
	isVerifiedPurchase: boolean;
	createdAt: string;
	product: ReviewProductRef | null;
}

export interface MyReviewsPage {
	reviews: MyReviewView[];
	totalDocs: number;
	page: number;
	totalPages: number;
	hasNextPage: boolean;
}

function mapArrayField(
	items: { value?: string | null }[] | null | undefined,
): string[] {
	return (items ?? [])
		.map((item) => item.value?.trim())
		.filter((value): value is string => Boolean(value));
}

function mapMyReview(doc: ProductReview): MyReviewView {
	return {
		id: String(doc.id),
		rating: toNumber(doc.rating),
		title: doc.title?.trim() || null,
		comment: doc.comment,
		pros: mapArrayField(doc.pros),
		cons: mapArrayField(doc.cons),
		status: doc.status ?? "pending",
		rejectionReason: doc.rejectionReason?.trim() || null,
		isVerifiedPurchase: Boolean(doc.isVerifiedPurchase),
		createdAt: doc.createdAt,
		product: mapProductRef(doc.product),
	};
}

export async function getUserReviews(
	userId: string | number,
	options: { page?: number; limit?: number; status?: ReviewStatus | null } = {},
): Promise<MyReviewsPage> {
	const payload = await getPayloadInstance();
	const { page = 1, limit = 10, status = null } = options;

	const conditions: Where[] = [{ user: { equals: Number(userId) } }];
	if (status) conditions.push({ status: { equals: status } });

	const result = await payload.find({
		collection: "product-reviews",
		where: { and: conditions },
		sort: "-createdAt",
		page,
		limit,
		depth: 2,
		overrideAccess: true,
	});

	return {
		reviews: (result.docs as unknown as ProductReview[]).map(mapMyReview),
		totalDocs: result.totalDocs,
		page: result.page ?? page,
		totalPages: result.totalPages,
		hasNextPage: result.hasNextPage,
	};
}

export interface UserReviewStats {
	total: number;
	byStatus: Record<ReviewStatus, number>;
	/** Средняя оценка, которую поставил сам пользователь. */
	averageGiven: number;
}

/**
 * Счётчики по статусам для панели отбора и сводки первого экрана.
 *
 * Один SQL вместо четырёх payload.count: четыре обращения к базе ради
 * четырёх чисел — не та цена, которую стоит платить за страницу кабинета.
 */
export async function getUserReviewStats(
	userId: string | number,
): Promise<UserReviewStats> {
	const payload = await getPayloadInstance();
	const result = (await payload.db.drizzle.execute(sql`
		SELECT
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
			COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
			COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
			COALESCE(AVG(rating), 0)::float AS average
		FROM product_reviews
		WHERE user_id = ${Number(userId)}
	`)) as DrizzleRows;

	const row = result.rows?.[0] ?? {};
	return {
		total: toNumber(row.total),
		byStatus: {
			approved: toNumber(row.approved),
			pending: toNumber(row.pending),
			rejected: toNumber(row.rejected),
		},
		averageGiven: toNumber(row.average),
	};
}

/* ===========================================================================
   Предложения оставить отзыв
   ===========================================================================
   «Можно оценить» в кабинете: товары, которые пользователь купил и о которых
   ещё не высказался.

   ────────────────────────────────────────────────────────────────────────────
   ПОЧЕМУ ПРЕДЛОЖЕНИЕ НЕ ХРАНИТСЯ, А ВЫЧИСЛЯЕТСЯ
   ────────────────────────────────────────────────────────────────────────────
   Предложение — это не факт, а следствие трёх изменчивых фактов: заказ
   завершён, товар всё ещё продаётся, отзыва ещё нет. Хранимая таблица
   предложений начала бы расходиться с каждым из них: товар сняли с продажи —
   предложение осталось; пользователь оставил отзыв на странице товара —
   предложение осталось. Пришлось бы держать инвалидацию в трёх хуках сразу
   (products, product-reviews, orders) и всё равно иметь окно рассинхрона.

   Проекция такой цены не стоит: выборка идёт по уже существующим индексам
   (orders_user_idx + orders_status_idx → orders_items_parent_id_idx →
   products_pkey → product_reviews_user_idx) и ограничена заказами ОДНОГО
   пользователя, а не таблицей заказов целиком.

   ────────────────────────────────────────────────────────────────────────────
   ПОЧЕМУ ДВА ЗАПРОСА, А НЕ ОДИН
   ────────────────────────────────────────────────────────────────────────────
   SQL отбирает только идентификаторы: заголовок товара лежит в
   products_locales, изображения — в таблице связей, категория — в третьей.
   Собирать это руками значило бы продублировать в SQL то, что Payload уже
   умеет (локали, depth, populate), и разойтись с ним на первой же правке.
   Поэтому тяжёлая часть — дедупликация и три условия отбора — остаётся в SQL,
   а документы забираются одним payload.find по готовому списку id.           */

/** Товар, о котором пользователь ещё может высказаться. */
export interface ReviewInvitation {
	/** Тот же вид товара, что у карточек отзывов, — списки должны совпадать. */
	product: ReviewProductRef;
	/** Дата САМОЙ СВЕЖЕЙ покупки: по ней предложения и сортируются. */
	lastPurchasedAt: string;
	/** В скольких завершённых заказах встретился товар (не число единиц). */
	ordersCount: number;
}

export interface ReviewInvitationsPage {
	invitations: ReviewInvitation[];
	page: number;
	hasNextPage: boolean;
}

/**
 * Условия, при которых покупка превращается в предложение.
 *
 * `delivered` — тот же финальный статус, что даёт право оставить отзыв
 * (hasUserPurchasedProduct, группа «Завершённые» в status.groups.ts). Другой
 * статус здесь означал бы, что кабинет зовёт оценить товар, а форма откажет.
 *
 * Условия «товар всё ещё продаётся» и «отзыва ещё нет» живут в
 * review-eligibility.ts и импортируются оттуда — своей редакции этот файл не
 * заводит. Причина переезда не стилистическая: их использует и хук заказа,
 * который тянет их в граф импортов payload.config.ts, а этот файл в тот граф
 * попадать не должен (см. шапку review-eligibility.ts).
 */

/**
 * Источник предложений: завершённые покупки пользователя, из которых ещё
 * можно сделать предложение оценить товар.
 *
 * Экспортируется ради модуля баннеров: факт `pendingReviews` обязан считаться
 * ЭТИМ запросом, а не своей копией условий.
 */
export function reviewInvitationSource(userId: number) {
	return sql`
		FROM orders o
		JOIN orders_items oi ON oi._parent_id = o.id
		JOIN products p ON p.id = oi.product_id
		WHERE o.user_id = ${userId}
			AND o.status = ${DELIVERED_STATUS}
			AND ${PRODUCT_STILL_ON_SALE}
			AND ${noReviewYet(userId, sql`oi.product_id`)}
	`;
}

/**
 * Сколько товаров ждут оценки. Нужно панели отбора, которая показывает число
 * рядом с подписью ещё до того, как раздел открыт.
 *
 * Считается тем же источником, что и сама выдача: два разных условия дали бы
 * счётчик, не сходящийся со списком под ним.
 */
export async function countReviewInvitations(
	userId: string | number,
): Promise<number> {
	const id = Number(userId);
	if (!Number.isFinite(id)) return 0;

	const payload = await getPayloadInstance();
	const result = (await payload.db.drizzle.execute(sql`
		SELECT COUNT(DISTINCT oi.product_id)::int AS count
		${reviewInvitationSource(id)}
	`)) as DrizzleRows;

	return toNumber(result.rows?.[0]?.count);
}

/**
 * Страница предложений оставить отзыв.
 *
 * Товар встречается РОВНО ОДИН РАЗ, сколько бы заказов и единиц за ним ни
 * стояло: группировка идёт по product_id, а количество единиц в выдачу не
 * входит вовсе. Три покупки одного товара — одно предложение.
 *
 * Порядок — от свежей покупки к давней: впечатление ещё живо, и оценить
 * последнее купленное естественнее, чем то, что взяли два года назад.
 * Вторичная сортировка по id обязательна — без неё две покупки, пришедшие
 * одной секундой (перенос исторических заказов кладёт их пачкой), могли бы
 * менять порядок между страницами, и товар либо задвоился бы, либо пропал.
 */
export async function getReviewInvitations(
	userId: string | number,
	options: { page?: number; limit?: number } = {},
): Promise<ReviewInvitationsPage> {
	const id = Number(userId);
	const { page = 1, limit = 12 } = options;
	const empty: ReviewInvitationsPage = {
		invitations: [],
		page,
		hasNextPage: false,
	};
	if (!Number.isFinite(id)) return empty;

	const payload = await getPayloadInstance();

	// Берём на одну строку больше запрошенного: наличие следующей страницы
	// выясняется без второго COUNT по тому же соединению.
	const result = (await payload.db.drizzle.execute(sql`
		SELECT
			oi.product_id AS product_id,
			MAX(o.created_at) AS last_purchased_at,
			COUNT(DISTINCT o.id)::int AS orders_count
		${reviewInvitationSource(id)}
		GROUP BY oi.product_id
		ORDER BY last_purchased_at DESC, oi.product_id DESC
		LIMIT ${limit + 1} OFFSET ${(page - 1) * limit}
	`)) as DrizzleRows;

	const rows = result.rows ?? [];
	const hasNextPage = rows.length > limit;
	const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
	if (pageRows.length === 0) return { ...empty, page };

	const ids = pageRows.map((row) => toNumber(row.product_id));

	// depth 2 — как у остальных выборок отзывов: товар (уровень 1) и его
	// категория с изображениями (уровень 2). Из категории строится ссылка, из
	// первого изображения — миниатюра.
	const products = await payload.find({
		collection: "products",
		where: { id: { in: ids } },
		limit: ids.length,
		depth: 2,
		overrideAccess: true,
	});

	const byId = new Map<number, Product>();
	for (const doc of products.docs as unknown as Product[]) {
		byId.set(Number(doc.id), doc);
	}

	// Порядок задаёт SQL, а не payload.find: тот сортирует по-своему, и без
	// восстановления порядка выдача перестала бы быть «от свежей покупки».
	const invitations = pageRows.flatMap<ReviewInvitation>((row) => {
		const product = byId.get(toNumber(row.product_id));
		const ref = mapProductRef(product);
		if (!ref) return [];

		const purchasedAt = row.last_purchased_at;
		return [
			{
				product: ref,
				lastPurchasedAt:
					purchasedAt instanceof Date
						? purchasedAt.toISOString()
						: String(purchasedAt),
				ordersCount: Math.max(1, toNumber(row.orders_count)),
			},
		];
	});

	return { invitations, page, hasNextPage };
}
