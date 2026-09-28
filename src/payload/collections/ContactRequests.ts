import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

/**
 * Обращения с сайта: форма на странице контактов (/contacts), заявки на
 * 3D-печать из блока на главной и заявки на товар, который сейчас нельзя
 * купить (карточка товара — «Оставить заявку»).
 *
 * Все потоки — одна очередь: их разбирает отдел продаж, и заявка на печать в
 * отдельной таблице лежала бы там, куда реже заглядывают. Различает их поле
 * «Тема» — по нему в админке фильтруется список и выбирается заголовок
 * письма-уведомления.
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
 * Набор полей повторяет формы один в один — см.
 * modules/contact/schemas/contact-request.schema.ts. У заявки на товар другой
 * состав: имя, телефон и количество, а связь с товаром — отдельным полем, а не
 * текстом в сообщении: менеджер должен открыть именно тот товар, а не искать
 * его по названию. Поэтому email и сообщение обязательны только для тем
 * «Обращение» и «3D-печать» (см. validate у полей).
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
/** Тема из соседних полей документа — для условной обязательности полей. */
function topicOf(siblingData: unknown): string | undefined {
	return (siblingData as { topic?: string } | undefined)?.topic;
}

export const ContactRequests: CollectionConfig = {
	slug: "contact-requests",
	labels: { singular: "Обращение", plural: "Обращения" },

	admin: {
		useAsTitle: "name",
		defaultColumns: [
			"name",
			"topic",
			"product",
			"email",
			"phone",
			"status",
			"createdAt",
		],
		group: "Поддержка",
		description:
			"Сообщения со страницы «Контакты», заявки на 3D-печать с главной и заявки на недоступные товары",
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
			name: "topic",
			type: "select",
			required: true,
			defaultValue: "general",
			index: true,
			label: "Тема",
			options: [
				{ label: "Обращение", value: "general" },
				{ label: "3D-печать", value: "print3d" },
				{ label: "Заявка на товар", value: "product" },
			],
			admin: { position: "sidebar" },
		},
		{
			name: "name",
			type: "text",
			required: true,
			minLength: 2,
			maxLength: 80,
			label: "Имя",
		},
		{
			// Не `required`: заявка на товар спрашивает телефон, а не почту.
			// Для остальных тем обязательность проверяет validate.
			name: "email",
			type: "email",
			index: true,
			label: "Email",
			validate: (value, { siblingData }) => {
				if (!value) {
					return topicOf(siblingData) === "product" ? true : "Укажите email";
				}
				return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
					? true
					: "Некорректный email";
			},
		},
		{
			// Необязателен: форма на контактах его не спрашивает, в заявке на
			// печать — по желанию (условия печати удобнее обсудить голосом).
			name: "phone",
			type: "text",
			label: "Телефон",
		},
		{
			// В заявке на товар сообщение — необязательный комментарий, для
			// остальных тем — суть обращения (минимум 10 символов).
			name: "message",
			type: "textarea",
			maxLength: 4000,
			label: "Сообщение",
			validate: (value: string | null | undefined, { siblingData }) => {
				const text = value?.trim() ?? "";
				if (topicOf(siblingData) === "product") return true;
				return text.length >= 10 ? true : "Минимум 10 символов";
			},
		},

		// ── Заявка на товар ──────────────────────────────────────────────────
		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			index: true,
			label: "Товар",
			admin: {
				condition: (data) => data?.topic === "product",
				description: "Товар, по которому оставлена заявка.",
			},
		},
		{
			name: "quantity",
			type: "number",
			min: 1,
			label: "Количество, шт.",
			admin: {
				condition: (data) => data?.topic === "product",
			},
		},
		{
			// Аккаунт отправителя, если он был авторизован. Анонимная заявка
			// тоже принимается — связь нужна менеджеру, чтобы видеть историю
			// заказов покупателя, а не для доступа.
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			label: "Аккаунт",
			admin: { position: "sidebar", readOnly: true },
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
