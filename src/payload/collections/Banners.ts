import type { Block, CollectionConfig, Field } from "payload";
// Импорт конкретных файлов, а не барели `modules/banners/index.ts`: весь граф,
// достижимый из payload.config.ts, грузится нативным резолвером Node без
// bundler-магии, и барель фичемодуля там запрещён (scripts/verify-payload-graph.mjs).
import {
	BANNER_CART_STATES,
	BANNER_CONDITION_MATCH,
	BANNER_ORDER_SCOPES,
	BANNER_TRACKED_ACTIONS,
} from "../../modules/banners/conditions.ts";
import {
	BANNER_IMAGE_MODES,
	BANNER_IMPORTANCE,
	BANNER_LINK_KINDS,
	BANNER_POLICY_KINDS,
	BANNER_PUBLISH_DELAY_MINUTES,
	BANNER_PUBLISH_DELAY_MS,
	isSafeBannerHref,
} from "../../modules/banners/vocabulary.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// Определение баннера — модального окна для авторизованного покупателя.
//
// ─── Что стало с прежней коллекцией ────────────────────────────────────────
//
// До этой задачи коллекция была прямым портом баннера мобильного приложения:
// массив медиа, `action: none|link|modal|redirect` со строкой-«параметром
// действия», `targeting.roles` и Payload-черновики. Она не была подключена НИ К
// ОДНОМУ экрану: единственный её потребитель, `services/banners.service.ts`, не
// импортировался ниоткуда. То есть в проекте существовала коллекция «баннеры»,
// которая ничего не показывала, и любая правка в ней не приводила ни к чему.
//
// Коллекция переписана, а не создана рядом второй: две коллекции с именем
// «баннеры», из которых одна мертва, — худший из возможных исходов. Что
// унаследовано осознанно: `priority`, окно `startAt/endAt`, `isSystem` — они
// решали те же задачи и решали верно.
//
// Что убрано и почему:
//
//   * `targeting.roles` — роль на коллекции `users` не является признаком
//     персонала (см. access/ownership.ts: покупатель с role=superadmin —
//     реальный случай из истории проекта). Таргетинг по недостоверному полю
//     хуже отсутствия таргетинга: он выглядит работающим;
//   * `versions.drafts` — Payload-черновик отвечает на вопрос «готов ли
//     текст», а поле `status` ниже — на вопрос «виден ли баннер». Два
//     механизма публикации давали произведение состояний, из которого половина
//     не имела смысла («опубликованный черновик»);
//   * `action: modal` — модальным окном баннер является сам; «баннер,
//     открывающий баннер» не имеет ни реализации, ни смысла;
//   * `action: redirect` против `link` — различие было в том, куда именно
//     деть пользователя, и выражается оно типом ссылки (внутренняя/внешняя),
//     а не отдельным режимом действия.
//
// ─── Границы ответственности ───────────────────────────────────────────────
//
// Эта коллекция владеет ОПРЕДЕЛЕНИЕМ баннера и ничем больше. Состояние показа
// у конкретного пользователя — `BannerStates`, журнал событий —
// `BannerEvents`: объём этих данных измеряется в строках на пользователя, а не
// в редакторских документах, и смешивать их с определением значило бы класть
// растущую аналитику в документ, который читают в горячем пути.
//
// ─── Пятнадцатиминутное окно ───────────────────────────────────────────────
//
// Публикация отложена на `BANNER_PUBLISH_DELAY_MINUTES` — это время на
// вычитку. Механизм ровно один и он же гарантия: хук ниже считает `publishAt`,
// а отбор (`modules/banners/server/definitions.ts`) НЕ ОТДАЁТ баннер, пока
// `publishAt > now`, независимо от статуса. Фоновая задача, переводящая статус
// по расписанию, не нужна и не заведена: она в этой схеме ничего не
// охраняла бы, а требовала бы отдельного worker-контейнера (в docker-compose
// они подняты по профилю и не гарантированы) — то есть цена была бы выше
// пользы. Насколько баннер живой прямо сейчас, показывает поле «Состояние»,
// которое считается при чтении.

/* --------------------------------------------------- блоки-условия --- */

type Condition = (
	data: unknown,
	siblingData: Record<string, unknown>,
) => boolean;

/**
 * Диапазон «от … до …», который администратор заполняет частично.
 *
 * Оба поля необязательны, и это существенно: «не меньше трёх» и «ровно три» —
 * разные условия, а обязательные границы заставили бы выражать первое через
 * заведомо большое число в поле «до», то есть через магическую константу в
 * данных.
 *
 * Имена полей задаются явно, а не собираются как `min`/`max`: в одном блоке
 * может быть несколько диапазонов (у корзины их три), и одинаковые имена
 * внутри блока Payload просто не соберёт.
 */
function range(options: {
	label: string;
	minName: string;
	maxName: string;
	description?: string;
	condition?: Condition;
	min?: number;
}): Field {
	return {
		type: "row",
		admin: options.condition ? { condition: options.condition } : {},
		fields: [
			{
				name: options.minName,
				type: "number",
				label: `${options.label}: от`,
				min: options.min,
				admin: {
					width: "50%",
					description:
						options.description ?? "Включительно. Пусто — без нижней границы.",
				},
			},
			{
				name: options.maxName,
				type: "number",
				label: `${options.label}: до`,
				min: options.min,
				admin: {
					width: "50%",
					description: "Включительно. Пусто — без верхней границы.",
				},
			},
		],
	};
}

/**
 * Условия как блоки, а не как одно поле с JSON.
 *
 * Блок даёт администратору форму на каждый тип условия — с подписанными
 * полями, подсказками и валидацией — вместо текстового поля, в которое надо
 * вписать выражение. Он же даёт типобезопасность: Payload генерирует
 * размеченное объединение по `blockType`, и разбор в `server/definitions.ts`
 * обязан покрыть все варианты, иначе не компилируется.
 *
 * Добавление нового типа условия — это новый блок здесь, новый предикат в
 * `modules/banners/conditions.ts` и новая ветка разбора. Ни один существующий
 * блок при этом не меняется, и ни один сохранённый баннер не мигрируется.
 */
const CONDITION_BLOCKS: Block[] = [
	{
		slug: "account-age",
		labels: { singular: "Возраст аккаунта", plural: "Возраст аккаунта" },
		fields: [
			range({
				label: "Суток с регистрации",
				minName: "minDays",
				maxName: "maxDays",
				min: 0,
			}),
		],
	},
	{
		slug: "email-verified",
		labels: { singular: "Почта подтверждена", plural: "Почта подтверждена" },
		fields: [
			{
				name: "verified",
				type: "checkbox",
				defaultValue: false,
				label: "Почта подтверждена",
				admin: {
					description:
						"Снятая галочка — условие «почта не подтверждена». Подтверждение делается кодом из письма при регистрации и в профиле.",
				},
			},
		],
	},
	{
		slug: "order-count",
		labels: { singular: "Заказы", plural: "Заказы" },
		fields: [
			{
				name: "scope",
				type: "select",
				required: true,
				defaultValue: "any",
				label: "Какие заказы считать",
				options: [
					{
						label: "Любые, кроме отменённых",
						value: "any" satisfies (typeof BANNER_ORDER_SCOPES)[number],
					},
					{ label: "Только доставленные", value: "delivered" },
					{
						label: "Только в работе (подтверждён … отправлен)",
						value: "active",
					},
				],
			},
			range({
				label: "Заказов",
				minName: "minCount",
				maxName: "maxCount",
				min: 0,
			}),
			range({
				label: "Суток с последнего заказа",
				minName: "minDaysSinceLast",
				maxName: "maxDaysSinceLast",
				min: 0,
				description:
					"Пусто — не спрашивать. Например, «от 90» — покупатель не заказывал три месяца.",
				condition: (_data, siblingData) => siblingData?.scope === "any",
			}),
		],
	},
	{
		slug: "cart",
		labels: { singular: "Корзина", plural: "Корзина" },
		fields: [
			{
				name: "state",
				type: "select",
				required: true,
				defaultValue: "filled",
				label: "Состояние корзины",
				options: [
					{
						label: "В корзине что-то есть",
						value: "filled" satisfies (typeof BANNER_CART_STATES)[number],
					},
					{ label: "Корзина пуста", value: "empty" },
				],
			},
			range({
				label: "Позиций в корзине",
				minName: "minItems",
				maxName: "maxItems",
				min: 0,
				condition: (_data, siblingData) => siblingData?.state !== "empty",
			}),
			range({
				label: "Сумма корзины, ₽",
				minName: "minTotal",
				maxName: "maxTotal",
				min: 0,
				condition: (_data, siblingData) => siblingData?.state !== "empty",
			}),
			range({
				label: "Часов без изменений",
				minName: "minIdleHours",
				maxName: "maxIdleHours",
				min: 0,
				description:
					"Сколько времени в корзину ничего не клали. «От 24» — забытая корзина.",
				condition: (_data, siblingData) => siblingData?.state !== "empty",
			}),
		],
	},
	{
		slug: "wishlist",
		labels: { singular: "Избранное", plural: "Избранное" },
		fields: [
			range({
				label: "Товаров в избранном",
				minName: "minItems",
				maxName: "maxItems",
				min: 0,
			}),
		],
	},
	{
		slug: "pending-reviews",
		labels: {
			singular: "Товары без отзыва",
			plural: "Товары без отзыва",
		},
		fields: [
			range({
				label: "Доставленных товаров без отзыва",
				minName: "minCount",
				maxName: "maxCount",
				min: 0,
				description:
					"Считается по тому же правилу, что и право оставить отзыв: товар из доставленного заказа, на который отзыва ещё нет.",
			}),
		],
	},
	{
		slug: "action",
		labels: {
			singular: "Действие покупателя",
			plural: "Действия покупателя",
		},
		fields: [
			{
				name: "action",
				type: "select",
				required: true,
				label: "Действие",
				options: [
					{ label: "Оформил заказ", value: "order_placed" },
					{ label: "Получил заказ", value: "order_delivered" },
					{ label: "Оставил отзыв", value: "review_left" },
					{ label: "Применил промокод", value: "promo_code_used" },
					{ label: "Добавил товар в избранное", value: "wishlist_item_added" },
				] satisfies {
					label: string;
					value: (typeof BANNER_TRACKED_ACTIONS)[number];
				}[],
			},
			{
				type: "row",
				fields: [
					{
						name: "performed",
						type: "checkbox",
						defaultValue: true,
						label: "Совершал",
						admin: {
							width: "50%",
							description: "Снятая галочка — «никогда не совершал».",
						},
					},
					{
						name: "withinDays",
						type: "number",
						label: "За последние, суток",
						min: 1,
						admin: {
							width: "50%",
							description: "Пусто — когда угодно.",
							condition: (_data, siblingData) =>
								siblingData?.performed !== false,
						},
					},
				],
			},
		],
	},
	{
		slug: "page",
		labels: { singular: "Страница", plural: "Страницы" },
		fields: [
			{
				name: "paths",
				type: "text",
				hasMany: true,
				required: true,
				label: "Пути",
				admin: {
					description:
						"Например /cart или /category. Совпадение по префиксу: раздел покрывает свои вложенные страницы. " +
						"Это единственное условие, которое проверяется в браузере, — оно выбирает момент показа, а не право видеть баннер.",
				},
			},
		],
	},
];

/* ------------------------------------------------------------- ссылки --- */

/**
 * Поля ссылки — одинаковые у кнопки и у ссылки в тексте.
 *
 * Общая функция вместо копии: расходящиеся правила проверки у двух ссылок в
 * одной модалке — ошибка, которую невозможно заметить в админке, потому что
 * видна она только на стороне, где ссылка не открылась.
 */
function linkFields(condition: Condition): Field[] {
	return [
		{
			name: "label",
			type: "text",
			label: "Подпись",
			maxLength: 60,
			admin: {
				condition,
				description:
					"Коротко и глаголом: «Перейти в корзину», а не «Подробнее».",
			},
		},
		{
			type: "row",
			admin: { condition },
			fields: [
				{
					name: "kind",
					type: "select",
					defaultValue: "internal",
					label: "Тип адреса",
					admin: { width: "40%" },
					options: BANNER_LINK_KINDS.map((value) => ({
						label:
							value === "internal" ? "Внутренняя страница" : "Внешний адрес",
						value,
					})),
				},
				{
					name: "href",
					type: "text",
					label: "Адрес",
					admin: {
						width: "60%",
						description:
							"Внутренняя — путь от корня: /cart. Внешняя — полный адрес с https://.",
					},
					validate: (
						value: string | null | undefined,
						options: { siblingData: unknown },
					) => {
						if (!value) return true;

						const sibling = options.siblingData as { kind?: string };
						const kind = sibling?.kind === "external" ? "external" : "internal";

						// Та же проверка, что и на выдаче клиенту. Здесь она —
						// подсказка администратору, там — гарантия; ни одна из двух не
						// лишняя.
						if (!isSafeBannerHref(kind, value)) {
							return kind === "external"
								? "Внешний адрес должен начинаться с http:// или https://."
								: "Внутренний путь должен начинаться с одной косой черты: /cart.";
						}
						return true;
					},
				},
			],
		},
	];
}

/**
 * «Кнопка включена, но не заполнена» — состояние, которое нельзя сохранить.
 *
 * Поля внутри группы не помечены `required`, и это вынужденно: Payload
 * проверяет обязательность ДО того, как посмотрит на `admin.condition`, и
 * обязательная подпись у выключенной кнопки не дала бы сохранить ни один
 * баннер без CTA. Поэтому проверка перенесена на уровень группы, где виден
 * флаг `enabled`.
 */
function requireWhenEnabled(what: string) {
	return (value: unknown) => {
		const group = (value ?? {}) as {
			enabled?: boolean;
			label?: string;
			href?: string;
		};

		if (!group.enabled) return true;
		if (!group.label?.trim() || !group.href?.trim()) {
			return `${what}: заполните подпись и адрес либо снимите галочку.`;
		}
		return true;
	};
}

/* --------------------------------------------------------------- хуки --- */

/**
 * Поля, правка которых обязана заново открыть окно проверки.
 *
 * Ровно то, ради чего задержка существует: текст, изображение, ссылки,
 * условия. Ошибка в условиях показывает верный текст неверным людям, а это то
 * же самое по последствиям, что и ошибка в тексте.
 *
 * Чего здесь НЕТ и намеренно: `status`, `priority`, `policy`, `startAt`,
 * `endAt`. Снятие баннера с показа обязано срабатывать мгновенно — окно
 * проверки на паузе означало бы пятнадцать минут показа баннера, который уже
 * решили выключить, то есть результат, противоположный задуманному.
 */
const REVIEWABLE_FIELDS = [
	"content",
	"cta",
	"link",
	"conditions",
	"conditionMatch",
] as const;

function changed(next: unknown, previous: unknown): boolean {
	// Сравнение по сериализации: поля — простые документы без функций и дат
	// внутри. Ложное срабатывание безобидно (лишние 15 минут проверки),
	// пропуск — нет, поэтому сравнение намеренно строгое.
	return JSON.stringify(next ?? null) !== JSON.stringify(previous ?? null);
}

/** Человеческий ответ на вопрос «виден ли он сейчас». */
function describeVisibility(doc: Record<string, unknown>): string {
	const status = doc.status as string | undefined;

	if (status === "draft") return "Черновик — не виден никому";
	if (status === "paused") return "На паузе — показ остановлен";
	if (status === "archived") return "В архиве";

	const publishAt = doc.publishAt ? new Date(String(doc.publishAt)) : null;
	if (!publishAt) return "Не опубликован";

	const now = Date.now();

	if (publishAt.getTime() > now) {
		const minutes = Math.ceil((publishAt.getTime() - now) / 60_000);
		return `Идёт проверка — станет виден через ${minutes} мин.`;
	}

	const startAt = doc.startAt ? new Date(String(doc.startAt)) : null;
	if (startAt && startAt.getTime() > now) {
		return `Проверка пройдена, показ начнётся ${startAt.toLocaleString("ru-RU")}`;
	}

	const endAt = doc.endAt ? new Date(String(doc.endAt)) : null;
	if (endAt && endAt.getTime() <= now) return "Показ завершён — срок вышел";

	return "Виден пользователям";
}

export const Banners: CollectionConfig = {
	slug: "banners",
	labels: { singular: "Баннер", plural: "Баннеры" },

	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "status", "visibility", "importance", "priority"],
		group: "Контент",
		description: `Модальные окна для авторизованных покупателей. Новый баннер становится виден не раньше чем через ${BANNER_PUBLISH_DELAY_MINUTES} минут после публикации — это время на проверку текста и ссылок.`,
	},

	access: {
		// Читают только сотрудники. Витрина берёт баннеры через Local API с
		// `overrideAccess`, поэтому публичное чтение здесь ничего не даёт — а
		// давало бы всякому посетителю полный список условий нацеливания, то
		// есть сегментацию клиентской базы. Прежняя коллекция открывала чтение
		// всем (`read: () => true`), и это было безопасно ровно потому, что
		// условий в ней не было.
		read: isAdminOrSuperAdmin,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "name",
			type: "text",
			required: true,
			label: "Название (для админки)",
			admin: {
				description:
					"Не показывается пользователю. Заголовок модалки — в разделе «Содержимое».",
			},
		},

		/* ------------------------------------------------ жизненный цикл --- */
		{
			type: "row",
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					defaultValue: "draft",
					index: true,
					label: "Статус",
					admin: {
						width: "50%",
						description:
							"«На публикацию» запускает отсчёт проверки. Баннер становится виден сам, когда отсчёт закончится.",
					},
					options: [
						{ label: "Черновик", value: "draft" },
						{ label: "На публикацию", value: "scheduled" },
						{ label: "На паузе", value: "paused" },
						{ label: "В архиве", value: "archived" },
					],
				},
				{
					name: "publishAt",
					type: "date",
					index: true,
					label: "Виден с",
					admin: {
						width: "50%",
						readOnly: true,
						date: { pickerAppearance: "dayAndTime" },
						description: `Раньше этого момента баннер не увидит никто. Считается автоматически: ${BANNER_PUBLISH_DELAY_MINUTES} минут от последней правки содержимого.`,
					},
				},
			],
		},
		{
			// Виртуальное поле: колонки БД у него нет, значение считается при
			// каждом чтении. Статус отвечает на вопрос «что решил администратор»,
			// а это — на вопрос «что из этого следует прямо сейчас», и второй
			// ответ меняется сам собой с ходом времени, то есть колонкой быть не
			// может в принципе.
			name: "visibility",
			type: "text",
			virtual: true,
			label: "Состояние",
			admin: { readOnly: true, position: "sidebar" },
			hooks: {
				afterRead: [({ data }) => describeVisibility(data ?? {})],
			},
		},
		{
			type: "row",
			fields: [
				{
					name: "startAt",
					type: "date",
					label: "Показывать с",
					admin: {
						width: "50%",
						date: { pickerAppearance: "dayAndTime" },
						description: "Пусто — с момента окончания проверки.",
					},
				},
				{
					name: "endAt",
					type: "date",
					label: "Показывать до",
					admin: {
						width: "50%",
						date: { pickerAppearance: "dayAndTime" },
						description: "Пусто — бессрочно.",
					},
					validate: (
						value: Date | string | null | undefined,
						options: { siblingData: unknown },
					) => {
						const startAt = (options.siblingData as { startAt?: Date | string })
							?.startAt;
						if (value && startAt && new Date(value) <= new Date(startAt)) {
							return "Дата окончания должна быть позже даты начала.";
						}
						return true;
					},
				},
			],
		},

		/* ----------------------------------------------------- содержимое --- */
		{
			name: "content",
			type: "group",
			label: "Содержимое",
			fields: [
				{
					name: "title",
					type: "text",
					required: true,
					maxLength: 90,
					label: "Заголовок",
					admin: {
						description:
							"До 90 символов. Длинный заголовок в модалке переносится, но перестаёт читаться с первого взгляда.",
					},
				},
				{
					name: "body",
					type: "textarea",
					maxLength: 400,
					label: "Текст",
					admin: {
						description:
							"До 400 символов. Модалка — не статья: если нужного не сказать в трёх предложениях, ведите ссылкой на страницу.",
					},
				},
				{
					name: "image",
					type: "upload",
					relationTo: "media",
					label: "Изображение",
					admin: { description: "Необязательно." },
				},
				{
					name: "imageMode",
					type: "select",
					required: true,
					defaultValue: "post",
					label: "Режим изображения",
					admin: {
						condition: (_data, siblingData) => Boolean(siblingData?.image),
						description:
							"«Пост» — картинка блоком над текстом. «Фон» — на всю модалку, текст поверх; проверьте читаемость на светлых снимках.",
					},
					options: BANNER_IMAGE_MODES.map((value) => ({
						label: value === "post" ? "Пост (картинка над текстом)" : "Фон",
						value,
					})),
				},
			],
		},
		{
			name: "cta",
			type: "group",
			label: "Кнопка действия",
			validate: requireWhenEnabled("Кнопка действия"),
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					defaultValue: true,
					label: "Показывать кнопку",
				},
				...linkFields((_data, siblingData) => siblingData?.enabled !== false),
			],
		},
		{
			name: "link",
			type: "group",
			label: "Ссылка в тексте",
			admin: {
				description:
					"Необязательна и не заменяет кнопку: кнопка — главное действие, ссылка — второстепенное («Условия доставки»).",
			},
			validate: requireWhenEnabled("Ссылка в тексте"),
			fields: [
				{
					name: "enabled",
					type: "checkbox",
					defaultValue: false,
					label: "Показывать ссылку",
				},
				...linkFields((_data, siblingData) => siblingData?.enabled === true),
			],
		},

		/* -------------------------------------------------------- условия --- */
		{
			name: "conditionMatch",
			type: "select",
			required: true,
			defaultValue: "all",
			label: "Как объединять условия",
			options: BANNER_CONDITION_MATCH.map((value) => ({
				label: value === "all" ? "Выполнены все" : "Выполнено хотя бы одно",
				value,
			})),
		},
		{
			name: "conditions",
			type: "blocks",
			label: "Условия показа",
			// Без этого Payload подставляет в кнопку имя поля как есть и рисует
			// «Добавить Condition» посреди русской формы.
			labels: { singular: "условие", plural: "условия" },
			blocks: CONDITION_BLOCKS,
			admin: {
				description:
					"Пусто — баннер доступен всем авторизованным покупателям. Неавторизованные не получают баннеры никогда, независимо от условий.",
			},
		},

		/* ------------------------------------------------ политика показа --- */
		{
			type: "row",
			fields: [
				{
					name: "importance",
					type: "select",
					required: true,
					defaultValue: "normal",
					label: "Важность",
					admin: {
						width: "50%",
						description:
							"Важный проходит очередь раньше обычных и может повторяться после быстрого закрытия. Внешне не отличается.",
					},
					options: BANNER_IMPORTANCE.map((value) => ({
						label: value === "important" ? "Важный" : "Обычный",
						value,
					})),
				},
				{
					name: "priority",
					type: "number",
					defaultValue: 0,
					index: true,
					label: "Приоритет",
					admin: {
						width: "50%",
						description:
							"Больше — раньше. Сравнивается только внутри своей важности.",
					},
				},
			],
		},
		{
			name: "delaySeconds",
			type: "number",
			defaultValue: 0,
			min: 0,
			max: 3600,
			label: "Задержка перед показом, секунд",
			admin: {
				description:
					"Экранное время после того, как баннер получен вкладкой. Отсчитывается, только пока вкладка открыта и видима.",
			},
		},
		{
			name: "policy",
			type: "group",
			label: "Политика показа",
			fields: [
				{
					name: "kind",
					type: "select",
					required: true,
					defaultValue: "once",
					label: "Правило",
					options: [
						{
							label: "Один раз",
							value: "once" satisfies (typeof BANNER_POLICY_KINDS)[number],
						},
						{ label: "Не больше N раз", value: "limited" },
						{ label: "Повторять с интервалом", value: "interval" },
						{ label: "Повторять до результата", value: "until_outcome" },
					],
				},
				{
					type: "row",
					fields: [
						{
							name: "repeatAfterHours",
							type: "number",
							min: 1,
							label: "Интервал повтора, часов",
							admin: {
								width: "50%",
								description: "Пусто — сутки.",
								condition: (_data, siblingData) => siblingData?.kind !== "once",
							},
						},
						{
							name: "maxImpressions",
							type: "number",
							min: 1,
							label: "Не больше показов",
							admin: {
								width: "50%",
								description:
									"Для «до результата» пусто означает пять — потолок против бесконечного повторения.",
								condition: (_data, siblingData) => siblingData?.kind !== "once",
							},
						},
					],
				},
				{
					name: "outcome",
					type: "select",
					required: true,
					defaultValue: "cta_or_dwell",
					label: "Что считать результатом",
					options: [
						{ label: "Нажал кнопку", value: "cta" },
						{ label: "Прочитал (модалка провисела N секунд)", value: "dwell" },
						{ label: "Нажал кнопку или прочитал", value: "cta_or_dwell" },
					],
					admin: {
						description:
							"Результат закрывает баннер навсегда при любой политике, не только при «до результата».",
					},
				},
				{
					name: "dwellSeconds",
					type: "number",
					defaultValue: 5,
					min: 1,
					max: 120,
					label: "Порог «прочитал», секунд",
					admin: {
						condition: (_data, siblingData) => siblingData?.outcome !== "cta",
					},
				},
			],
		},

		/* ---------------------------------------------------- служебное --- */
		{
			name: "isSystem",
			type: "checkbox",
			defaultValue: false,
			label: "Системный",
			admin: {
				position: "sidebar",
				description: "Создан кодом (seed), а не редактором.",
			},
		},
		{
			name: "seedKey",
			type: "text",
			unique: true,
			index: true,
			label: "Ключ сценария",
			admin: {
				position: "sidebar",
				readOnly: true,
				description:
					"Ключ стартового сценария. По нему seed узнаёт свой баннер и не создаёт второй.",
			},
		},
		{
			name: "createdBy",
			type: "relationship",
			relationTo: "admins",
			label: "Создал",
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "updatedBy",
			type: "relationship",
			relationTo: "admins",
			label: "Изменил",
			admin: { position: "sidebar", readOnly: true },
		},
	],

	hooks: {
		beforeChange: [
			({ data, originalDoc, req, operation }) => {
				const next = { ...data } as Record<string, unknown>;
				const previous = (originalDoc ?? {}) as Record<string, unknown>;

				// Авторство — только у персонала: сервисные вызовы (seed) идут без
				// пользователя, и подставлять туда чей-либо id нечестно.
				if (req.user?.collection === "admins") {
					next.updatedBy = req.user.id;
					if (operation === "create") next.createdBy = req.user.id;
				}

				if (next.status !== "scheduled") return next;

				const reviewableEdit = REVIEWABLE_FIELDS.some((field) =>
					changed(next[field], previous[field]),
				);

				// Прошёл ли этот баннер проверку хоть раз. Пауза считается
				// пройденной проверкой: содержимое уже смотрели, а у оперативной
				// меры обязана быть столь же оперативная отмена. Архив — нет: он
				// снят навсегда, и возвращение в строй заслуживает второго взгляда
				// ровно так же, как публикация черновика.
				const reviewed =
					Boolean(previous.publishAt) &&
					(previous.status === "scheduled" || previous.status === "paused");

				if (!reviewed || reviewableEdit) {
					// Либо баннер публикуется впервые, либо администратор поправил
					// то, ради чего задержка и существует. В обоих случаях отсчёт
					// идёт заново — в том числе для уже показанного баннера, чтобы
					// исправление опечатки тоже можно было перечитать.
					next.publishAt = new Date(
						Date.now() + BANNER_PUBLISH_DELAY_MS,
					).toISOString();
					return next;
				}

				// Проверка пройдена и содержимое не тронуто: срок остаётся прежним.
				// Пересчитывать его на каждом сохранении значило бы отодвигать
				// публикацию всякий раз, когда администратор поправил приоритет.
				next.publishAt = previous.publishAt;

				return next;
			},
		],
		// Кэш определений в Data Cache живёт до инвалидации тега — без этих двух
		// строк правка в админке не доезжала бы до витрины вовсе. Тот же тег
		// «banners» использовала и прежняя коллекция.
		afterChange: [createRevalidateCacheHook("banners")],
		afterDelete: [createRevalidateCacheHook("banners")],
	},
};
