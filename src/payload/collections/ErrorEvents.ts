// src/payload/collections/ErrorEvents.ts
import type { CollectionAfterReadHook, CollectionConfig, Field } from "payload";
import { isSuperAdmin, isSuperAdminUser } from "../access/isSuperAdmin.ts";

/**
 * Журнал серверных ошибок — «сырая» половина системы оповещений
 * (src/services/observability/README.md).
 *
 * Сюда пишется всё, что поймала любая точка перехвата: исходный текст
 * ошибки, полный стек, пользователь, IP, фактический путь запроса. Письмо
 * получает урезанную версию (safe-payload.ts), связывает их `errorId`, а в
 * письме стоит прямая ссылка на карточку записи.
 *
 * ─── Гейт персональных данных ───────────────────────────────────────────────
 *
 * Две вещи различаются принципиально:
 *
 *  • СПИСОК — сотни записей подряд. Будь в нём идентификаторы пользователей,
 *    адреса и исходные тексты ошибок (а Drizzle кладёт в текст параметры
 *    запроса — ФИО, телефоны, адреса доставки), он был бы выгрузкой
 *    персональных данных, открываемой одной ссылкой. Поэтому группа `raw`
 *    при чтении многих записей вырезается хуком ниже — на уровне Payload, а
 *    не вёрстки: её нет ни в админке, ни в ответе REST `GET /api/error-events`.
 *    Колонкой и фильтром списка она тоже не предлагается.
 *
 *  • КАРТОЧКА — одна запись, открытая осознанно, по ссылке из письма. В ней
 *    видно всё: ради этого сырая половина и существует.
 *
 * Доступ к журналу целиком — только у суперадминистратора (isSuperAdmin.ts):
 * карточка происшествия — самый широкий доступ к ПДн среди служебных
 * экранов, и он не должен достаться сотруднику лишь потому, что тот может
 * входить в админку.
 *
 * Записи создаёт только сервер (overrideAccess); изменять и удалять их из
 * админки нельзя — журнал, который можно поправить, ничего не доказывает.
 * Старые записи удаляет суточная задача (ERROR_LOG_RETENTION_DAYS).
 */

const RAW_GROUP = "raw";

/** Сырые поля не покидают карточку. См. шапку. */
const stripRawInLists: CollectionAfterReadHook = ({ doc, findMany }) => {
	if (!findMany || !doc || typeof doc !== "object") return doc;
	const { [RAW_GROUP]: _raw, ...rest } = doc as Record<string, unknown>;
	return rest;
};

const readOnly = { readOnly: true } as const;

/** Сырые поля: только в карточке, не колонка и не фильтр списка. */
const rawAdmin = {
	readOnly: true,
	disableListColumn: true,
	disableListFilter: true,
	disableGroupBy: true,
} as const;

const rawFields: Field[] = [
	{
		name: "message",
		type: "textarea",
		label: "Исходный текст ошибки",
		admin: rawAdmin,
	},
	{ name: "causes", type: "textarea", label: "Причины", admin: rawAdmin },
	{ name: "stack", type: "textarea", label: "Стек целиком", admin: rawAdmin },
	{
		name: "path",
		type: "text",
		label: "Фактический путь запроса",
		admin: rawAdmin,
	},
	{ name: "userId", type: "text", label: "Пользователь", admin: rawAdmin },
	{ name: "ip", type: "text", label: "IP", admin: rawAdmin },
	{ name: "userAgent", type: "text", label: "User-Agent", admin: rawAdmin },
	{ name: "extra", type: "json", label: "Контекст", admin: rawAdmin },
];

export const ErrorEvents: CollectionConfig = {
	slug: "error-events",
	labels: { singular: "Ошибка", plural: "Журнал ошибок" },

	admin: {
		group: "Система",
		useAsTitle: "errorName",
		defaultColumns: [
			"occurredAt",
			"severity",
			"errorName",
			"message",
			"module",
			"notifiedSent",
		],
		listSearchableFields: ["errorId", "fingerprint", "message"],
		description:
			"Серверные ошибки сайта и воркеров. В списке — только очищенные " +
			"данные; исходный текст, пользователь и IP — в карточке записи. " +
			"Все случаи одной ошибки: фильтр по полю «Отпечаток».",
		hidden: ({ user }) => !isSuperAdminUser(user),
		pagination: { defaultLimit: 50 },
	},

	defaultSort: "-occurredAt",

	access: {
		read: isSuperAdmin,
		create: () => false,
		update: () => false,
		delete: () => false,
	},

	hooks: {
		afterRead: [stripRawInLists],
	},

	fields: [
		{
			name: "occurredAt",
			type: "date",
			label: "Когда",
			required: true,
			index: true,
			admin: {
				...readOnly,
				date: {
					pickerAppearance: "dayAndTime",
					displayFormat: "dd.MM.yyyy HH:mm:ss",
				},
			},
		},
		{
			name: "severity",
			type: "select",
			label: "Уровень",
			required: true,
			options: [
				{ label: "Падение", value: "fatal" },
				{ label: "Ошибка", value: "error" },
				{ label: "Предупреждение", value: "warning" },
			],
			admin: readOnly,
		},
		{
			name: "errorName",
			type: "text",
			label: "Класс ошибки",
			required: true,
			admin: readOnly,
		},
		{
			name: "message",
			type: "textarea",
			label: "Сообщение (очищенное)",
			required: true,
			admin: {
				...readOnly,
				description:
					"То же, что ушло письмом: значения заменены плейсхолдерами.",
			},
		},
		{ name: "code", type: "text", label: "Код", admin: readOnly },
		{
			name: "source",
			type: "text",
			label: "Источник",
			required: true,
			admin: readOnly,
		},
		{ name: "module", type: "text", label: "Модуль", admin: readOnly },
		{
			name: "frames",
			type: "textarea",
			label: "Стек (очищенный)",
			admin: readOnly,
		},
		{
			name: "causes",
			type: "textarea",
			label: "Причины (очищенные)",
			admin: readOnly,
		},
		{
			type: "row",
			fields: [
				{ name: "httpMethod", type: "text", label: "Метод", admin: readOnly },
				{
					name: "httpRoute",
					type: "text",
					label: "Маршрут (шаблон)",
					admin: readOnly,
				},
				{
					name: "httpStatus",
					type: "number",
					label: "Код ответа",
					admin: readOnly,
				},
			],
		},
		{
			type: "row",
			fields: [
				{ name: "jobQueue", type: "text", label: "Очередь", admin: readOnly },
				{ name: "jobName", type: "text", label: "Задача", admin: readOnly },
				{ name: "jobAttempt", type: "text", label: "Попытка", admin: readOnly },
			],
		},
		{
			name: "userRef",
			type: "text",
			label: "Псевдоним пользователя",
			admin: {
				...readOnly,
				description:
					"HMAC от идентификатора — «тот же или другой», без раскрытия, кто.",
			},
		},
		{
			type: "row",
			fields: [
				{
					name: "processName",
					type: "text",
					label: "Процесс",
					required: true,
					admin: readOnly,
				},
				{
					name: "hostname",
					type: "text",
					label: "Узел",
					required: true,
					admin: readOnly,
				},
				{
					name: "environment",
					type: "text",
					label: "Стенд",
					required: true,
					admin: readOnly,
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "errorId",
					type: "text",
					label: "errorId",
					required: true,
					unique: true,
					admin: readOnly,
				},
				{
					name: "fingerprint",
					type: "text",
					label: "Отпечаток",
					required: true,
					index: true,
					admin: readOnly,
				},
			],
		},
		{
			type: "row",
			fields: [
				{
					name: "notifiedSent",
					type: "checkbox",
					label: "Письмо отправлено",
					admin: readOnly,
				},
				{
					name: "notifiedReason",
					type: "text",
					label: "Почему письма не было",
					admin: readOnly,
				},
			],
		},
		{
			name: RAW_GROUP,
			type: "group",
			label: "Полная запись — персональные данные",
			admin: {
				description:
					"Может содержать персональные данные покупателей. Видна только в " +
					"карточке, в письмо и в список не попадает.",
				disableListColumn: true,
				disableListFilter: true,
			},
			access: { read: ({ req }) => isSuperAdminUser(req.user) },
			fields: rawFields,
		},
	],
	timestamps: true,
};
