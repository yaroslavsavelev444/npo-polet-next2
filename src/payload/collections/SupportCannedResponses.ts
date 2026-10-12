import type { Access, CollectionConfig, Where } from "payload";
import { SUPPORT_TOPICS } from "../../modules/support-chat/lib/constants.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isStaffUser } from "../access/ownership.ts";

/** Общие заготовки видны всему персоналу, личные — только владельцу. */
const readSharedOrOwn: Access = ({ req }) => {
	if (!isStaffUser(req.user)) return false;
	const where: Where = {
		or: [{ scope: { equals: "shared" } }, { owner: { equals: req.user?.id } }],
	};
	return where;
};

/**
 * Заготовки ответов менеджеров.
 *
 * Менеджер вставляет заготовку командой `/ярлык` или из подсказки над полем
 * ввода. Подсказка появляется, когда сообщение покупателя совпало с одной из
 * фраз-триггеров: «есть сертификаты?» → заготовка «Сертификаты» вместе с
 * PDF из Media. Совпадение ищется полнотекстовым поиском Postgres с русской
 * морфологией (см. src/modules/support-chat/server/canned-match.ts), поэтому
 * триггер «сертификат» ловит и «сертификаты», и «сертификатов». Фраза из
 * нескольких слов срабатывает, когда в сообщении есть все её слова — в любом
 * порядке и форме.
 *
 * Заготовка никогда не уходит покупателю сама: она попадает в поле ввода, и
 * отправляет её менеджер.
 */
export const SupportCannedResponses: CollectionConfig = {
	slug: "support-canned-responses",
	labels: {
		singular: "Заготовка ответа",
		plural: "Заготовки ответов",
	},

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "shortcut", "scope", "usageCount", "isActive"],
		group: "Поддержка",
	},

	access: {
		read: readSharedOrOwn,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			label: "Название",
		},
		{
			name: "shortcut",
			type: "text",
			unique: true,
			label: "Ярлык",
			admin: {
				description:
					"Короткое слово для вставки командой: «серт» → менеджер набирает /серт.",
			},
			validate: (value: string | null | undefined) => {
				if (!value) return true;
				return /^[a-zа-яё0-9_-]{2,32}$/i.test(value)
					? true
					: "Ярлык — от 2 до 32 букв, цифр, «-» или «_», без пробелов";
			},
		},
		{
			name: "body",
			type: "textarea",
			required: true,
			label: "Текст ответа",
			admin: {
				description:
					"Переменные подставляются при вставке: {{имя}} — имя покупателя, " +
					"{{менеджер}} — имя менеджера, {{номерЗаказа}} — заказ из контекста.",
			},
		},
		{
			name: "attachments",
			type: "relationship",
			relationTo: "media",
			hasMany: true,
			label: "Файлы",
			admin: {
				description:
					"Сертификаты, паспорта, инструкции из медиатеки — уходят вместе с текстом.",
			},
		},
		{
			name: "triggers",
			type: "array",
			label: "Фразы-триггеры",
			labels: { singular: "Фраза", plural: "Фразы" },
			admin: {
				description:
					"Когда сообщение покупателя содержит все слова фразы (в любой форме), " +
					"заготовка подсказывается менеджеру.",
			},
			fields: [
				{
					name: "phrase",
					type: "text",
					required: true,
					label: "Фраза",
				},
			],
		},
		{
			name: "topics",
			type: "select",
			hasMany: true,
			label: "Темы",
			options: SUPPORT_TOPICS.map(({ value, label }) => ({ value, label })),
			admin: {
				description: "В диалогах этих тем заготовка поднимается выше.",
			},
		},
		{
			name: "scope",
			type: "select",
			required: true,
			defaultValue: "shared",
			label: "Видимость",
			options: [
				{ label: "Для всех менеджеров", value: "shared" },
				{ label: "Личная", value: "personal" },
			],
			admin: { position: "sidebar" },
		},
		{
			name: "owner",
			type: "relationship",
			relationTo: "admins",
			label: "Владелец",
			admin: {
				position: "sidebar",
				condition: (_, siblingData) => siblingData?.scope === "personal",
			},
			validate: (
				value: unknown,
				{ siblingData }: { siblingData: { scope?: string } },
			) =>
				siblingData?.scope === "personal" && !value
					? "У личной заготовки должен быть владелец"
					: true,
		},
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			label: "Активна",
			admin: { position: "sidebar" },
		},
		{
			name: "usageCount",
			type: "number",
			defaultValue: 0,
			label: "Использована раз",
			admin: { position: "sidebar", readOnly: true },
		},
		{
			name: "suggestedCount",
			type: "number",
			defaultValue: 0,
			label: "Подсказана раз",
			admin: {
				position: "sidebar",
				readOnly: true,
				description:
					"Часто подсказывается и редко используется — триггеры стоит уточнить.",
			},
		},
		{
			name: "lastUsedAt",
			type: "date",
			label: "Последнее использование",
			admin: { position: "sidebar", readOnly: true },
		},
	],
};
