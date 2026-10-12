import type { CollectionConfig } from "payload";
import { SUPPORT_TOPICS } from "../../modules/support-chat/lib/constants.ts";
import { decryptCsatCommentOnRead } from "../../modules/support-chat/server/field-hooks.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";

/**
 * Диалог покупателя с менеджерами (модуль support-chat).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДИН АКТИВНЫЙ ДИАЛОГ НА ПОКУПАТЕЛЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Чат устроен как мессенджер, а не как тикеты: у покупателя одна открытая
 * переписка, и вопрос про другой заказ — следующее сообщение в ней, с
 * карточкой контекста на самом сообщении. Гарантирует это частичный
 * уникальный индекс `support_conversations_one_open_per_user_idx`
 * (user_id WHERE status = 'open') — в конфигурации Payload его не выразить,
 * он живёт только в миграции. Закрытый диалог переоткрывается, если
 * покупатель напишет в пределах окна из настроек; позже — заводится новый.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАПИСЬ ТОЛЬКО ЧЕРЕЗ СЕРВИС
 * ────────────────────────────────────────────────────────────────────────────
 * Счётчики (`lastSeq`, отметки прочтения, `awaitingReplySince`) меняются
 * атомарно вместе с сообщениями — сырым SQL в одной транзакции
 * (src/modules/support-chat/server/*.db.ts). Хуков у коллекции поэтому нет и
 * быть не должно: изменения через SQL хуки не видят, и побочный эффект в хуке
 * срабатывал бы через раз. REST закрыт на запись полностью.
 *
 * Числа — numeric (так Payload хранит поле number): драйвер отдаёт их
 * строками, сервисный слой приводит к Number сам.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ШИФРОВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * У диалога свой ключ данных (`encryptionKey`, обёрнут мастер-ключом из
 * окружения). Им зашифрованы сообщения и комментарий к оценке. Сообщения
 * в админке Payload не показываются — читать переписку менеджеры ходят в
 * консоль поддержки.
 */
export const SupportConversations: CollectionConfig = {
	slug: "support-conversations",
	labels: {
		singular: "Диалог поддержки",
		plural: "Диалоги поддержки",
	},

	admin: {
		useAsTitle: "id",
		defaultColumns: ["user", "status", "assignee", "topic", "lastMessageAt"],
		group: "Поддержка",
		description:
			"Переписка покупателей с менеджерами. Отвечать — в консоли поддержки; " +
			"здесь записи только для просмотра.",
	},

	access: {
		read: ownedByUserOrStaff,
		create: () => false,
		update: () => false,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			label: "Покупатель",
			admin: {
				readOnly: true,
				description: "Пусто — аккаунт удалён, переписка обезличена.",
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "open",
			index: true,
			label: "Статус",
			options: [
				{ label: "Открыт", value: "open" },
				{ label: "Закрыт", value: "resolved" },
			],
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "snoozedUntil",
			type: "date",
			label: "Отложен до",
			admin: {
				position: "sidebar",
				readOnly: true,
				date: { pickerAppearance: "dayAndTime" },
			},
		},
		{
			name: "assignee",
			type: "relationship",
			relationTo: "admins",
			index: true,
			label: "Менеджер",
			admin: {
				position: "sidebar",
				readOnly: true,
				description: "Пусто — диалог в общей очереди.",
			},
		},
		{
			name: "assignedAt",
			type: "date",
			label: "Назначен",
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "topic",
			type: "select",
			required: true,
			defaultValue: "other",
			label: "Тема",
			options: SUPPORT_TOPICS.map(({ value, label }) => ({ value, label })),
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "priority",
			type: "select",
			required: true,
			defaultValue: "normal",
			label: "Приоритет",
			options: [
				{ label: "Обычный", value: "normal" },
				{ label: "Высокий", value: "high" },
			],
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "tags",
			type: "text",
			hasMany: true,
			label: "Метки",
			admin: { readOnly: true },
		},

		// ── Порядок и прочтение ─────────────────────────────────────────────
		{
			name: "lastSeq",
			type: "number",
			required: true,
			defaultValue: 0,
			label: "Последний номер сообщения",
			admin: {
				readOnly: true,
				description:
					"Сообщения диалога нумеруются подряд с 1. Клиент после разрыва " +
					"связи догружает всё, что новее известного ему номера.",
			},
		},
		{
			name: "customerLastReadSeq",
			type: "number",
			required: true,
			defaultValue: 0,
			label: "Прочитано покупателем до №",
			admin: { readOnly: true },
		},
		{
			name: "staffLastReadSeq",
			type: "number",
			required: true,
			defaultValue: 0,
			label: "Прочитано менеджерами до №",
			admin: { readOnly: true },
		},

		// ── Время ───────────────────────────────────────────────────────────
		{
			name: "lastMessageAt",
			type: "date",
			index: true,
			label: "Последнее сообщение",
			admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "lastCustomerMessageAt",
			type: "date",
			label: "Последнее сообщение покупателя",
			admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "lastStaffMessageAt",
			type: "date",
			label: "Последний ответ менеджера",
			admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "awaitingReplySince",
			type: "date",
			index: true,
			label: "Ждёт ответа с",
			admin: {
				readOnly: true,
				date: { pickerAppearance: "dayAndTime" },
				description:
					"Ставится первым неотвеченным сообщением покупателя, снимается " +
					"ответом менеджера. Основа сроков ответа и порядка очереди.",
			},
		},
		{
			name: "firstResponseAt",
			type: "date",
			label: "Первый ответ",
			admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "resolvedAt",
			type: "date",
			label: "Закрыт",
			admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "reopenedCount",
			type: "number",
			required: true,
			defaultValue: 0,
			label: "Сколько раз переоткрыт",
			admin: { readOnly: true },
		},

		// ── Оценка ──────────────────────────────────────────────────────────
		{
			name: "csatScore",
			type: "number",
			min: 1,
			max: 5,
			label: "Оценка покупателя",
			admin: { readOnly: true },
		},
		{
			name: "csatComment",
			type: "textarea",
			label: "Комментарий к оценке",
			admin: { readOnly: true },
			// В базе — шифртекст ключом диалога (см. support-chat/server/crypto.ts).
			hooks: { afterRead: [decryptCsatCommentOnRead] },
		},

		// ── Согласие ────────────────────────────────────────────────────────
		{
			name: "consentAcceptedAt",
			type: "date",
			label: "Согласие на обработку ПДн",
			admin: {
				position: "sidebar",
				readOnly: true,
				date: { pickerAppearance: "dayAndTime" },
				description:
					"Момент, когда покупатель подтвердил согласие, начиная переписку.",
			},
		},
		{
			name: "consentDocument",
			type: "text",
			label: "Редакция документа",
			admin: {
				position: "sidebar",
				readOnly: true,
				description: "Slug соглашения, принятого при старте переписки.",
			},
		},
		{
			name: "userAgent",
			type: "text",
			label: "User-Agent устройства",
			admin: { readOnly: true },
		},

		{
			name: "encryptionKey",
			type: "text",
			required: true,
			label: "Ключ диалога (зашифрован)",
			// Обёрнутый мастер-ключом ключ данных диалога. Наружу не отдаётся
			// никогда: без мастер-ключа он бесполезен, но и показывать его
			// незачем. Пишет и читает только модуль чата сырым SQL.
			access: { read: () => false, create: () => false, update: () => false },
			admin: { hidden: true },
		},
	],

	indexes: [
		// Список очереди в консоли: открытые, по менеджеру, свежие сверху.
		{ fields: ["status", "assignee", "lastMessageAt"] },
		// История покупателя.
		{ fields: ["user", "lastMessageAt"] },
	],
};
