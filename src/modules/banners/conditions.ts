import type { BannerImportance } from "./vocabulary.ts";

// Условия показа: расширяемая система, устроенная как ПРЕДИКАТЫ НАД ФАКТАМИ.
//
// ─── Почему именно так, а не «каждое условие само ходит в базу» ─────────────
//
// Очевидная реализация — интерфейс `Condition { matches(userId) }` с запросом
// внутри каждого условия. Она разваливается на первом же реальном сценарии: у
// пользователя десять живых баннеров, у каждого по три условия, половина
// условий спрашивает «сколько у него заказов» — и один заход на сайт стоит
// тридцати запросов, из которых двадцать семь одинаковые. Кэш на уровне
// условия эту проблему не решает, а размножает: он появляется в каждом условии
// заново и в каждом по-своему.
//
// Поэтому условие здесь — ЧИСТАЯ ФУНКЦИЯ `(параметры, факты) → boolean`, а
// факты о пользователе собираются один раз за проход (`server/facts.ts`) и
// переиспользуются всеми кандидатами. Отсюда три свойства:
//
//   * производительность — фиксированное число запросов на проход, не
//     зависящее ни от количества баннеров, ни от количества условий;
//   * типобезопасность — `BannerCondition` это размеченное объединение, ровно
//     повторяющее блоки Payload, и таблица предикатов обязана содержать запись
//     на каждый вариант, иначе не компилируется;
//   * тестируемость — правило проверяется таблицей значений, без базы.
//
// ─── Как добавить новое условие ────────────────────────────────────────────
//
//   1. добавить вариант в `BannerCondition` и ключ в BANNER_CONDITION_KINDS;
//   2. добавить предикат в `SERVER_EVALUATORS` (TypeScript потребует сам);
//   3. если ему нужен новый факт — добавить поле в `BannerAudienceFacts` и его
//      вычисление в `server/facts.ts`;
//   4. добавить блок в `payload/collections/Banners.ts` и ветку разбора в
//      `server/definitions.ts`.
//
// Ни один существующий файл при этом не переписывается.
//
// ─── Чем набор условий отличается от исходного (Comersi) ───────────────────
//
// Условия описывают ПОКУПАТЕЛЯ ИНТЕРНЕТ-МАГАЗИНА, а не продавца объявлений.
// Тарифы, платные подписки, квоты отчётов, черновики мастера объявлений и
// счётчик публикаций в Полёте не существуют — ни как сущность, ни как
// функционально близкий аналог, — поэтому соответствующие условия не
// перенесены, а не «перенесены и отключены»: условие, которое никогда не
// выполняется, выглядит в админке как рабочее и тратит время того, кто им
// воспользуется. Взамен появились заказы, корзина, избранное и отзывы —
// сущности, вокруг которых в Полёте и происходит всё, что стоит баннера.

/* ---------------------------------------------------------------- факты --- */

/**
 * Всё, что система знает о пользователе на момент проверки.
 *
 * Плоская структура из скаляров, и это требование, а не стиль: факты
 * сериализуются в лог решения, по которому потом отвечают на вопрос «почему
 * этот человек увидел этот баннер». Вложенный документ в таком логе нечитаем.
 *
 * Значение `null` означает «неизвестно» и НИКОГДА не трактуется как «нет»:
 * условие, которому нужен неизвестный факт, не выполняется. Иначе сбой чтения
 * заказов показал бы баннер «оформите первый заказ» человеку, который покупает
 * у нас третий год.
 */
export type BannerAudienceFacts = {
	/** Возраст аккаунта в сутках. */
	accountAgeDays: number;
	emailVerified: boolean;
	/** Заказов в любом состоянии, кроме отменённых. */
	totalOrders: number;
	/** Доставленных заказов. */
	deliveredOrders: number;
	/** Заказов, которые сейчас в работе (оплачен/собирается/едет). */
	activeOrders: number;
	/** Сколько суток назад оформлен последний заказ; `null` — заказов нет. */
	daysSinceLastOrder: number | null;
	/** Товарных позиций в корзине сейчас. */
	cartItems: number;
	/** Сумма корзины в рублях по текущим ценам; 0 при пустой корзине. */
	cartTotal: number;
	/**
	 * Сколько часов назад в корзину клали товар в последний раз.
	 *
	 * `null` — корзина пуста. Это и есть мера «брошенности»: непустая корзина,
	 * которую не трогали сутки, — единственный признак забытого заказа,
	 * доступный без отдельного журнала событий.
	 */
	cartIdleHours: number | null;
	/** Товаров в избранном. */
	wishlistItems: number;
	/** Отзывов написано (в любом статусе модерации). */
	reviewsWritten: number;
	/**
	 * Доставленных товаров, на которые пользователь ещё не написал отзыв.
	 *
	 * Считается по тому же правилу, что и право оставить отзыв
	 * (`reviews.service.ts`): доставленный заказ плюс отсутствие отзыва на этот
	 * товар. Второе правило здесь было бы вторым ответом на вопрос «можно ли
	 * отозваться», и первый же расход между ними дал бы баннер, ведущий на
	 * форму, которая откажет.
	 */
	pendingReviews: number;
	/**
	 * Когда пользователь в последний раз совершал именованное действие.
	 *
	 * Ключи — из `BANNER_TRACKED_ACTIONS`, значения — возраст события в сутках.
	 * Отсутствие ключа означает «не совершал никогда», и это отличается от нуля.
	 */
	actionAgeDays: Partial<Record<BannerTrackedAction, number>>;
};

/**
 * Действия, о которых система умеет спрашивать «делал ли и когда».
 *
 * Список закрытый, а не произвольная строка: незакрытый список — это опечатка,
 * которая даёт баннер, не показывающийся никому, и молчит об этом. Каждое
 * значение поддержано конкретным чтением в `server/facts.ts`; добавить новое —
 * значит добавить и чтение.
 */
export const BANNER_TRACKED_ACTIONS = [
	"order_placed",
	"order_delivered",
	"review_left",
	"promo_code_used",
	"wishlist_item_added",
] as const;
export type BannerTrackedAction = (typeof BANNER_TRACKED_ACTIONS)[number];

/**
 * То, что известно только браузеру.
 *
 * Сейчас это один адрес страницы. Отдельный тип, а не поле в `facts`, потому
 * что граница проходит именно здесь: факты собирает и проверяет сервер,
 * контекст приходит с клиента и НЕ МОЖЕТ считаться доверенным. Условия,
 * работающие с контекстом, помечены `scope: "client"` и никогда не решают
 * вопрос доступа — они только откладывают показ до нужного экрана.
 */
export type BannerClientContext = {
	/** Текущий `pathname`, без query. */
	path: string;
};

/* ------------------------------------------------------------- условия --- */

export const BANNER_CONDITION_KINDS = [
	"account-age",
	"email-verified",
	"order-count",
	"cart",
	"wishlist",
	"pending-reviews",
	"action",
	"page",
] as const;
export type BannerConditionKind = (typeof BANNER_CONDITION_KINDS)[number];

export type NumericRange = {
	/** Включительно. `null` — без нижней границы. */
	min: number | null;
	/** Включительно. `null` — без верхней границы. */
	max: number | null;
};

/** На какие заказы смотрит условие «количество заказов». */
export const BANNER_ORDER_SCOPES = ["any", "delivered", "active"] as const;
export type BannerOrderScope = (typeof BANNER_ORDER_SCOPES)[number];

/** Что за состояние корзины проверяется. */
export const BANNER_CART_STATES = ["empty", "filled"] as const;
export type BannerCartState = (typeof BANNER_CART_STATES)[number];

/**
 * Одно условие. Размеченное объединение по `kind` — ровно то, что описывают
 * блоки коллекции, поэтому документ конвертируется в этот тип без приведения.
 */
export type BannerCondition =
	| { kind: "account-age"; days: NumericRange }
	| { kind: "email-verified"; verified: boolean }
	| {
			kind: "order-count";
			scope: BannerOrderScope;
			count: NumericRange;
			/** Только для `any`: когда был последний заказ. */
			daysSinceLast?: NumericRange;
	  }
	| {
			kind: "cart";
			state: BannerCartState;
			/** Только для `filled`. */
			items?: NumericRange;
			/** Только для `filled`, в рублях. */
			total?: NumericRange;
			/** Только для `filled`: сколько часов корзину не трогали. */
			idleHours?: NumericRange;
	  }
	| { kind: "wishlist"; items: NumericRange }
	| { kind: "pending-reviews"; count: NumericRange }
	/** Действие совершено (или не совершено) в пределах N суток. */
	| {
			kind: "action";
			action: BannerTrackedAction;
			performed: boolean;
			/** Только для `performed: true`. `null` — когда угодно. */
			withinDays: number | null;
	  }
	/** Клиентское. Пользователь находится на одной из страниц. */
	| { kind: "page"; paths: string[] };

/**
 * Где проверяется условие.
 *
 * Всё, кроме `page`, — на сервере: «критичное» здесь означает «определяет право
 * видеть». `page` правом не является: баннер, дошедший до браузера,
 * пользователю уже положен, и адрес страницы лишь выбирает момент. Поэтому
 * доверять клиенту в этом одном месте безопасно, а в остальных — нет.
 */
export const CONDITION_SCOPE: Record<BannerConditionKind, "server" | "client"> =
	{
		"account-age": "server",
		"email-verified": "server",
		"order-count": "server",
		cart: "server",
		wishlist: "server",
		"pending-reviews": "server",
		action: "server",
		page: "client",
	};

/* ----------------------------------------------------------- предикаты --- */

/** `null` в факте означает «неизвестно» и никогда не проходит проверку. */
function inRange(
	value: number | null | undefined,
	range: NumericRange,
): boolean {
	if (value === null || value === undefined) return false;
	if (range.min !== null && value < range.min) return false;
	if (range.max !== null && value > range.max) return false;
	return true;
}

/** Незаданный диапазон вопроса не задаёт — проверять нечего. */
function inOptionalRange(
	value: number | null | undefined,
	range: NumericRange | undefined,
): boolean {
	if (!range) return true;
	if (range.min === null && range.max === null) return true;
	return inRange(value, range);
}

type Evaluator<K extends BannerConditionKind> = (
	condition: Extract<BannerCondition, { kind: K }>,
	facts: BannerAudienceFacts,
) => boolean;

/**
 * Таблица правил. Отсутствие записи — ошибка компиляции, а не пустая проверка,
 * которая молча пропускает всех.
 */
const SERVER_EVALUATORS: {
	[K in Exclude<BannerConditionKind, "page">]: Evaluator<K>;
} = {
	"account-age": (condition, facts) =>
		inRange(facts.accountAgeDays, condition.days),

	"email-verified": (condition, facts) =>
		facts.emailVerified === condition.verified,

	"order-count": (condition, facts) => {
		const count =
			condition.scope === "delivered"
				? facts.deliveredOrders
				: condition.scope === "active"
					? facts.activeOrders
					: facts.totalOrders;

		if (!inRange(count, condition.count)) return false;

		// «Когда был последний» осмысленно только для всех заказов разом:
		// у «доставленных» и «в работе» свои даты, и спрашивать о них одним
		// полем значило бы отвечать не на тот вопрос, который задан.
		if (condition.scope !== "any") return true;

		return inOptionalRange(facts.daysSinceLastOrder, condition.daysSinceLast);
	},

	cart: (condition, facts) => {
		const filled = facts.cartItems > 0;
		if (filled !== (condition.state === "filled")) return false;
		if (condition.state === "empty") return true;

		return (
			inOptionalRange(facts.cartItems, condition.items) &&
			inOptionalRange(facts.cartTotal, condition.total) &&
			inOptionalRange(facts.cartIdleHours, condition.idleHours)
		);
	},

	wishlist: (condition, facts) => inRange(facts.wishlistItems, condition.items),

	"pending-reviews": (condition, facts) =>
		inRange(facts.pendingReviews, condition.count),

	action: (condition, facts) => {
		const age = facts.actionAgeDays[condition.action];

		if (!condition.performed) return age === undefined;
		if (age === undefined) return false;
		return condition.withinDays === null || age <= condition.withinDays;
	},
};

/**
 * Проверить одно серверное условие.
 *
 * `page` сюда не попадает по типу: попытка проверить клиентское условие на
 * сервере — это ошибка компиляции, а не ложное «не подходит», которое
 * задержало бы баннер навсегда.
 */
export function evaluateServerCondition(
	condition: BannerCondition,
	facts: BannerAudienceFacts,
): boolean {
	if (condition.kind === "page") return true;

	// Сужение по `kind` внутри объединения дженериков TypeScript не выводит без
	// подсказки; таблица выше уже гарантирует соответствие ключа и параметра.
	const evaluate = SERVER_EVALUATORS[condition.kind] as (
		c: BannerCondition,
		f: BannerAudienceFacts,
	) => boolean;

	return evaluate(condition, facts);
}

/**
 * Как объединяются несколько условий.
 *
 * `all` — умолчание и почти всегда верный выбор. `any` существует ради
 * сценариев вида «в корзине что-то есть ИЛИ в избранном что-то есть», которые
 * иначе требовали бы двух копий одного баннера.
 */
export const BANNER_CONDITION_MATCH = ["all", "any"] as const;
export type BannerConditionMatch = (typeof BANNER_CONDITION_MATCH)[number];

/**
 * Сопоставление путей — префиксное, потому что администратор мыслит разделами,
 * а не маршрутами: `/category` обязан покрывать `/category/hydraulics`. Точное
 * совпадение остаётся доступным (префикс, равный самому адресу), а обратное —
 * покрыть раздел, перечислив все его страницы, — невозможно в принципе.
 *
 * Пустой список путей означает «на любой странице».
 *
 * ⚠ Корень `/` — ЕДИНСТВЕННОЕ исключение из префиксного правила: он совпадает
 * только с самой главной страницей. Буквальное префиксное сравнение делает `/`
 * префиксом всех без исключения адресов, то есть превращает «показывать на
 * главной» в «показывать везде» — ровно противоположное тому, что имел в виду
 * администратор, и притом молча. Такой баннер не выглядит сломанным: он
 * исправно показывается, просто не там. Ошибка обнаружилась на первом же
 * сценарии стартового набора, где «забытая корзина» вышла поверх страницы
 * оформления заказа — то есть поверх того самого действия, к которому она
 * призывает.
 */
export function matchesPath(paths: readonly string[], path: string): boolean {
	if (paths.length === 0) return true;

	return paths.some((prefix) => {
		if (path === prefix) return true;
		if (prefix === "/") return false;

		return path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
	});
}

export type ConditionOutcome = {
	matched: boolean;
	/**
	 * Условия не выполнены ТОЛЬКО из-за страницы: человек подходит, но сейчас
	 * находится не там.
	 *
	 * Различие нужно вызывающему для выбора между «этому пользователю баннер не
	 * положен» и «положен, но не сейчас». Первое означает «забыть до изменения
	 * фактов», второе — «вернуться, когда он перейдёт на нужный экран».
	 */
	blockedByPage: boolean;
};

/**
 * Единая проверка всех условий баннера.
 *
 * Серверные и клиентские условия проверяются ВМЕСТЕ, одной функцией и с одним
 * правилом объединения. Раздельная проверка («сначала все серверные, потом все
 * клиентские») даёт неверный результат при `match: "any"`: баннер с условиями
 * «в корзине пусто ИЛИ на странице каталога» требовал бы от человека с полной
 * корзиной ещё и нахождения в каталоге, потому что каждая половина
 * проверялась бы на «хотя бы одно» отдельно.
 *
 * `context: null` означает «где сейчас пользователь — неизвестно». Условие
 * страницы тогда не выполняется, а `blockedByPage` сообщает почему.
 *
 * Пустой список условий означает «всем авторизованным» — единственное разумное
 * поведение: баннер без условий администратор создаёт именно затем. Заметим,
 * что `any` с пустым списком тоже даёт `true`, а не `false`, как дала бы
 * буквальная `Array.some`: «ни одно из ни одного» — это не отказ, а отсутствие
 * вопроса.
 */
export function evaluateConditions(params: {
	conditions: readonly BannerCondition[];
	match: BannerConditionMatch;
	facts: BannerAudienceFacts;
	context: BannerClientContext | null;
}): ConditionOutcome {
	const { conditions, match, facts, context } = params;

	if (conditions.length === 0) return { matched: true, blockedByPage: false };

	const results = conditions.map((condition) => ({
		condition,
		passed:
			condition.kind === "page"
				? context !== null && matchesPath(condition.paths, context.path)
				: evaluateServerCondition(condition, facts),
	}));

	const matched =
		match === "all"
			? results.every((result) => result.passed)
			: results.some((result) => result.passed);

	if (matched) return { matched: true, blockedByPage: false };

	// Виновата страница ровно тогда, когда всё остальное прошло: при `all` —
	// провалились только условия страницы; при `any` — ни одно не прошло, но
	// среди них есть страничное, которое могло бы пройти на другом экране.
	const failed = results.filter((result) => !result.passed);
	const blockedByPage =
		failed.length > 0 &&
		failed.every((result) => result.condition.kind === "page");

	return { matched: false, blockedByPage };
}

/**
 * Клиентская перепроверка перед самым показом.
 *
 * Дублирует часть `evaluateConditions` намеренно: сервер решал по адресу,
 * который браузер прислал вместе с запросом, а за время ожидания экранного
 * времени человек мог уйти на другую страницу. Дешевле перепроверить в момент
 * открытия, чем показать баннер про брошенную корзину поверх страницы
 * оформления заказа.
 */
export function matchesClientContext(
	conditions: readonly BannerCondition[],
	match: BannerConditionMatch,
	context: BannerClientContext,
): boolean {
	const pageConditions = conditions.filter(
		(condition): condition is Extract<BannerCondition, { kind: "page" }> =>
			condition.kind === "page",
	);

	if (pageConditions.length === 0) return true;

	// `any` здесь всегда истинно: серверная половина уже дала согласие, а при
	// «хотя бы одно» её одной достаточно. Проверять страницу в этом режиме
	// значило бы отменять решение, которое сервер уже принял по другому
	// условию.
	if (match === "any") return true;

	return pageConditions.every((condition) =>
		matchesPath(condition.paths, context.path),
	);
}

/* -------------------------------------------------------------- очередь --- */

/**
 * Вес баннера в очереди.
 *
 * Важность прибавляет фиксированную величину, заведомо большую любого
 * разумного ручного приоритета, — так «важный с приоритетом 0» всегда обгоняет
 * «обычный с приоритетом 50». Умножение вместо сложения дало бы важному
 * баннеру с нулевым приоритетом нулевой вес, то есть ровно противоположный
 * результат, и это единственная ошибка, которую здесь легко сделать.
 */
export const IMPORTANT_BANNER_WEIGHT = 1_000_000;

export function bannerWeight(
	importance: BannerImportance,
	priority: number,
): number {
	return priority + (importance === "important" ? IMPORTANT_BANNER_WEIGHT : 0);
}
