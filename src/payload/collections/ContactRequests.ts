import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

/**
 * Обращения с публичной страницы контактов (/contacts).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОТДЕЛЬНАЯ КОЛЛЕКЦИЯ, А НЕ `feedbacks`
 * ────────────────────────────────────────────────────────────────────────────
 * Feedbacks — служебный канал: баги, предложения по сайту, проблемы с
 * заказом. Там обязателен `type` из шести технических категорий и
 * `title` длиной от пяти символов, а обрабатывает их тот, кто чинит сайт.
 *
 * Сюда приходит другое: запрос от потенциального заказчика («нужен комплекс
 * на объект, посчитайте»). У него нет ни категории, ни заголовка, и разбирает
 * его не поддержка, а отдел продаж. Свалить оба потока в одну таблицу значило
 * бы, что письмо от заказчика лежит в админке между двумя отчётами о
 * съехавшей вёрстке — и рано или поздно потеряется.
 *
 * Набор полей повторяет форму на странице ровно один в один (имя, email,
 * сообщение) — см. modules/contact/schemas/contact-request.schema.ts.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СОГЛАСИЕ НА ОБРАБОТКУ ПЕРСОНАЛЬНЫХ ДАННЫХ
 * ────────────────────────────────────────────────────────────────────────────
 * Хранится не флагом «да/нет», а МОМЕНТОМ времени. Галочка без даты ничего не
 * доказывает: она отвечает на вопрос «согласен?», тогда как по 152-ФЗ нужно
 * ответить на «когда согласился и с какой редакцией документа». Поэтому в
 * записи лежат отметка времени и slug документа, действовавшего на тот момент.
 *
 * Оба поля проставляет сервер (server action), а не клиент: форма может
 * прислать что угодно, а запись должна отражать факт.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУП
 * ────────────────────────────────────────────────────────────────────────────
 * `create: () => false` — единственный легитимный путь создания проходит через
 * server action submitContactRequestAction, который сначала валидирует данные
 * и проверяет rate-limit, а потом пишет запись с overrideAccess. Прямой POST
 * на /api/contact-requests невозможен, и подделать userAgent или дату согласия
 * с клиента нельзя.
 */
export const ContactRequests: CollectionConfig = {
	slug: "contact-requests",

	admin: {
		useAsTitle: "name",
		defaultColumns: ["name", "email", "status", "createdAt"],
		group: "Поддержка",
		description: "Сообщения, отправленные через форму на странице «Контакты»",
	},

	access: {
		read: isAdminOrSuperAdmin,
		create: () => false,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		afterChange: [createRevalidateCacheHook("contact-requests")],
		afterDelete: [createRevalidateCacheHook("contact-requests")],
	},

	fields: [
		{
			name: "name",
			type: "text",
			required: true,
			minLength: 2,
			maxLength: 80,
			label: "Имя",
		},
		{
			name: "email",
			type: "email",
			required: true,
			index: true,
			label: "Email",
		},
		{
			name: "message",
			type: "textarea",
			required: true,
			minLength: 10,
			maxLength: 4000,
			label: "Сообщение",
		},

		// ── Обработка ────────────────────────────────────────────────────────
		{
			name: "status",
			type: "select",
			defaultValue: "new",
			index: true,
			label: "Статус",
			options: [
				{ label: "Новое", value: "new" },
				{ label: "В работе", value: "in_progress" },
				{ label: "Обработано", value: "done" },
			],
			admin: { position: "sidebar" },
		},

		// ── Согласие ─────────────────────────────────────────────────────────
		{
			name: "consentAcceptedAt",
			type: "date",
			required: true,
			label: "Согласие на обработку ПДн",
			admin: {
				position: "sidebar",
				readOnly: true,
				date: { pickerAppearance: "dayAndTime" },
				description:
					"Момент, когда отправитель подтвердил согласие. Проставляется сервером.",
			},
		},
		{
			name: "consentDocument",
			type: "text",
			label: "Редакция документа",
			admin: {
				position: "sidebar",
				readOnly: true,
				description:
					"Slug соглашения, на которое ссылалась форма в момент отправки.",
			},
		},

		// ── Техническая информация ───────────────────────────────────────────
		{
			name: "userAgent",
			type: "text",
			label: "User-Agent устройства",
			admin: {
				readOnly: true,
				description:
					"С какого устройства/браузера отправлено сообщение. " +
					"Проставляется автоматически из заголовков запроса.",
			},
		},
	],
};
