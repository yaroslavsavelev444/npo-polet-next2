import type { Access, CollectionConfig, Where } from "payload";
import { decryptMessageBodyOnRead } from "../../modules/support-chat/server/field-hooks.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isStaffUser } from "../access/ownership.ts";

/**
 * Покупатель читает сообщения своих диалогов — кроме внутренних заметок.
 *
 * Фильтр по `kind` здесь, в access, а не только в сервисе и интерфейсе:
 * REST (`/api/support-messages`) и GraphQL Payload публикует для коллекции
 * сам, и единственное место, которое их закрывает, — эта функция. Заметка
 * менеджера («клиент сложный, скидку не давать») не должна быть доступна
 * покупателю ни одним транспортом.
 */
const readOwnVisibleOrStaff: Access = ({ req }) => {
	if (!req.user) return false;
	if (isStaffUser(req.user)) return true;
	if (req.user.collection !== "users") return false;
	const where: Where = {
		and: [
			{ "conversation.user": { equals: req.user.id } },
			{ kind: { not_equals: "note" } },
		],
	};
	return where;
};

/**
 * Сообщение диалога поддержки.
 *
 * Номер `seq` идёт подряд с 1 внутри диалога и выдаётся в той же транзакции,
 * что и вставка (см. src/modules/support-chat/server/messages.db.ts), поэтому
 * дыр и повторов не бывает. По нему клиент восстанавливает порядок и после
 * разрыва связи догружает пропущенное.
 *
 * `clientMessageId` — идентификатор, который сообщению дал отправитель ещё до
 * отправки. Уникален в пределах диалога: повтор отправки после обрыва
 * возвращает уже сохранённое сообщение, а не создаёт второе.
 *
 * Запись — только сервисом (сырым SQL, атомарно с диалогом); хуков нет по той
 * же причине, что и у support-conversations.
 */
export const SupportMessages: CollectionConfig = {
	slug: "support-messages",
	labels: {
		singular: "Сообщение поддержки",
		plural: "Сообщения поддержки",
	},

	admin: {
		useAsTitle: "id",
		defaultColumns: ["conversation", "seq", "authorType", "kind", "createdAt"],
		group: "Поддержка",
		hidden: true,
	},

	access: {
		read: readOwnVisibleOrStaff,
		create: () => false,
		update: () => false,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "conversation",
			type: "relationship",
			relationTo: "support-conversations",
			required: true,
			index: true,
			label: "Диалог",
		},
		{
			name: "seq",
			type: "number",
			required: true,
			label: "№ в диалоге",
		},
		{
			name: "authorType",
			type: "select",
			required: true,
			label: "Автор",
			options: [
				{ label: "Покупатель", value: "customer" },
				{ label: "Менеджер", value: "staff" },
				{ label: "Система", value: "system" },
			],
		},
		{
			name: "authorUser",
			type: "relationship",
			relationTo: "users",
			label: "Покупатель-автор",
		},
		{
			name: "authorAdmin",
			type: "relationship",
			relationTo: "admins",
			label: "Менеджер-автор",
		},
		{
			name: "kind",
			type: "select",
			required: true,
			defaultValue: "text",
			label: "Вид",
			options: [
				{ label: "Сообщение", value: "text" },
				{ label: "Внутренняя заметка", value: "note" },
				{ label: "Системное", value: "system" },
			],
		},
		{
			name: "body",
			type: "textarea",
			label: "Текст",
			admin: {
				description:
					"В базе — шифртекст: текст, контекст (заказ, товар) и приложенные " +
					"документы одним зашифрованным JSON (см. support-chat/server/crypto.ts). " +
					"Показывается как простой текст, разметка от пользователя не исполняется.",
			},
			hooks: { afterRead: [decryptMessageBodyOnRead] },
		},
		{
			name: "clientMessageId",
			type: "text",
			label: "Идентификатор отправителя",
			admin: { readOnly: true },
		},
		{
			name: "cannedResponse",
			type: "relationship",
			relationTo: "support-canned-responses",
			label: "Заготовка",
		},
		{ name: "editedAt", type: "date", label: "Изменено" },
		{ name: "deletedAt", type: "date", label: "Удалено" },
		{
			name: "attachments",
			type: "join",
			collection: "support-attachments",
			on: "message",
			label: "Вложения",
		},
	],

	indexes: [
		{ fields: ["conversation", "seq"], unique: true },
		{ fields: ["conversation", "clientMessageId"], unique: true },
	],
};
