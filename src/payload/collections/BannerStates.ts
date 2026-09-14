import type { CollectionConfig } from "payload";
import {
	BANNER_CLOSE_METHODS,
	BANNER_STATE_STATUSES,
} from "../../modules/banners/vocabulary.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

// Состояние одного баннера у одного пользователя.
//
// ─── Почему это не аналитика ───────────────────────────────────────────────
//
// Здесь ТЕКУЩЕЕ состояние, одна строка на пару «пользователь + баннер».
// История взаимодействий — в `BannerEvents`, и разделение принципиальное:
// состояние читается на каждом отборе баннеров и обязано быть маленьким и
// индексируемым, журнал пишется на каждое движение и обязан быть append-only.
//
// ─── Почему отдельная коллекция, а не поля в Banners ───────────────────────
//
// По той же причине, по которой активации промокодов живут в
// `PromoCodeRedemptions`, а не счётчиком в самом промокоде: на вопрос «сколько
// раз ЭТОТ человек видел ЭТОТ баннер» нельзя ответить числом на документе
// баннера, нужна выборка по паре. Разница лишь в объёме — строк здесь будет
// больше, поэтому коллекция скрыта из меню админки: смотреть её списком
// незачем, а вот открыть по ссылке из разбора жалобы «мне это показали пять
// раз» — вполне.
//
// ─── Записи создаёт только движок ──────────────────────────────────────────
//
// Ручное создание и правка запрещены всем, включая администраторов: счётчики
// показов и назначенное время повтора обязаны меняться вместе с журналом
// событий, а правка в админке изменила бы только одну сторону и
// рассинхронизировала бы учёт. Движок пишет через Local API с
// `overrideAccess: true`.

export const BannerStates: CollectionConfig = {
	slug: "banner-states",
	labels: {
		singular: "Состояние баннера",
		plural: "Состояния баннеров",
	},

	admin: {
		group: "Система",
		useAsTitle: "id",
		defaultColumns: [
			"banner",
			"user",
			"status",
			"impressions",
			"lastShownAt",
			"nextEligibleAt",
		],
		description:
			"Служебный журнал только для чтения: сколько раз баннер показан конкретному пользователю и когда его можно показать снова.",
		hidden: true,
	},

	access: {
		read: isAdminOrSuperAdmin,
		create: () => false,
		update: () => false,
		delete: () => false,
	},

	// Одна строка на пару — единственное правило целостности, которое база
	// способна обеспечить сама. Без него два параллельных запроса за следующим
	// баннером (две вкладки, открытые одновременно) создали бы два состояния, и
	// лимит показов молча удвоился бы.
	indexes: [{ fields: ["user", "banner"], unique: true }],

	fields: [
		{
			name: "banner",
			type: "relationship",
			relationTo: "banners",
			required: true,
			index: true,
			label: "Баннер",
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Пользователь",
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			index: true,
			label: "Состояние",
			options: [
				{ label: "Активен", value: "active" },
				{ label: "Цель достигнута", value: "satisfied" },
				{ label: "Показы исчерпаны", value: "exhausted" },
			] satisfies {
				label: string;
				value: (typeof BANNER_STATE_STATUSES)[number];
			}[],
		},

		/* ------------------------------------------------------ счётчики --- */
		{
			name: "impressions",
			type: "number",
			required: true,
			defaultValue: 0,
			min: 0,
			label: "Показов",
			admin: { description: "Сколько раз модалка действительно открывалась." },
		},
		{
			name: "deliveries",
			type: "number",
			required: true,
			defaultValue: 0,
			min: 0,
			label: "Выдач",
			admin: {
				description:
					"Сколько раз баннер уходил клиенту — включая недошедшие до показа.",
			},
		},
		{
			name: "ctaClicks",
			type: "number",
			required: true,
			defaultValue: 0,
			min: 0,
			label: "Нажатий на кнопку",
		},
		{
			name: "totalDwellMs",
			type: "number",
			required: true,
			defaultValue: 0,
			min: 0,
			label: "Суммарное время просмотра, мс",
		},

		/* ---------------------------------------------------------- даты --- */
		{ name: "firstShownAt", type: "date", label: "Первый показ" },
		{ name: "lastShownAt", type: "date", label: "Последний показ" },
		{
			name: "nextEligibleAt",
			type: "date",
			index: true,
			label: "Можно показать снова с",
			admin: { description: "Пусто — можно сейчас." },
		},
		{
			name: "outcomeReachedAt",
			type: "date",
			label: "Цель достигнута",
			admin: { description: "Пусто — не достигнута." },
		},

		/* ------------------------------------------------------- текущий --- */
		{
			name: "lastImpressionId",
			type: "text",
			index: true,
			label: "Идентификатор последнего показа",
			admin: {
				description:
					"Событие приходит с идентификатором показа, и сверять его надо с тем, что сервер выдал последним, а не с «каким-нибудь из прошлых».",
			},
		},
		{
			// «Баннер в полёте»: выдан, но ещё не закрыт.
			//
			// В исходной системе эту роль играл замок в Redis, и он был там
			// необходим, потому что баннеры рассылал сервер — два процесса могли
			// отправить по баннеру одновременно. Здесь баннер запрашивает сам
			// браузер, а выдача идёт одной транзакцией с созданием этой строки, и
			// durable-поле справляется лучше замка: оно переживает перезапуск
			// кэша, а Redis в проекте не является обязательной зависимостью
			// (REDIS_URL опционален и используется только очередью удаления
			// аккаунта).
			name: "inFlightSince",
			type: "date",
			index: true,
			label: "Ожидает показа с",
			admin: {
				description:
					"Пока заполнено, следующий баннер этому пользователю не выдаётся. Сбрасывается закрытием модалки и по истечении получаса.",
			},
		},
		{
			name: "lastCloseMethod",
			type: "select",
			label: "Как закрыли в последний раз",
			options: BANNER_CLOSE_METHODS.map((value) => ({
				label: value,
				value,
			})),
		},
	],
};
