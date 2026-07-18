import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

/**
 * Обращения обратной связи (кнопка с иконкой бага на сайте).
 *
 * Модель сознательно минимальна: в старой версии коллекция несла десятки
 * полей (приоритет, назначение, теги, вложения, внутренние заметки, голоса,
 * дубликаты, связи, IP, полный deviceInfo, привязка к профилю), которые
 * реально не использовались и захламляли админку. Оставлено ровно то, что
 * нужно для обработки обращения: тип, заголовок, описание, email для связи,
 * статус, User-Agent устройства и дата создания (проставляется Payload).
 *
 * Создание закрыто на уровне доступа (create: () => false): единственный
 * легитимный путь — server action submitFeedbackAction, который создаёт
 * запись через overrideAccess ПОСЛЕ rate-limit и валидации и сам проставляет
 * User-Agent из заголовков запроса. Так прямой POST на /api/feedbacks
 * невозможен, а данные об устройстве нельзя подделать с клиента.
 */
export const Feedbacks: CollectionConfig = {
	slug: "feedbacks",

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "type", "status", "userEmail", "createdAt"],
		group: "Поддержка",
		description: "Обращения пользователей: баги, предложения, вопросы",
	},

	access: {
		// Читать/обрабатывать обращения может только персонал.
		read: isAdminOrSuperAdmin,
		// Создание — только через server action с overrideAccess (см. докстринг).
		create: () => false,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		afterChange: [createRevalidateCacheHook("feedbacks")],
		afterDelete: [createRevalidateCacheHook("feedbacks")],
	},

	fields: [
		// ── Классификация ────────────────────────────────────────────────────────
		{
			name: "type",
			type: "select",
			required: true,
			index: true,
			label: "Тип обращения",
			options: [
				{ label: "Ошибка / баг", value: "bug" },
				{ label: "Предложение по улучшению", value: "improvement" },
				{ label: "Вопрос", value: "question" },
				{ label: "Проблема с заказом", value: "order_issue" },
				{ label: "Проблема с аккаунтом", value: "account_issue" },
				{ label: "Другое", value: "other" },
			],
		},

		// ── Содержание ───────────────────────────────────────────────────────────
		{
			name: "title",
			type: "text",
			required: true,
			minLength: 5,
			maxLength: 120,
			label: "Заголовок",
		},
		{
			name: "description",
			type: "textarea",
			required: true,
			minLength: 20,
			maxLength: 4000,
			label: "Описание",
		},

		// ── Контакт ──────────────────────────────────────────────────────────────
		{
			name: "userEmail",
			type: "email",
			required: true,
			label: "Email для связи",
		},

		// ── Обработка ────────────────────────────────────────────────────────────
		{
			name: "status",
			type: "select",
			defaultValue: "new",
			index: true,
			label: "Статус",
			// Значения new/in_progress/resolved сохранены из прежней схемы, чтобы
			// не пересоздавать enum; изменились только набор и подписи.
			options: [
				{ label: "Новый", value: "new" },
				{ label: "В работе", value: "in_progress" },
				{ label: "Готов", value: "resolved" },
			],
			admin: { position: "sidebar" },
		},

		// ── Информация об устройстве ─────────────────────────────────────────────
		{
			name: "userAgent",
			type: "text",
			label: "User-Agent устройства",
			admin: {
				readOnly: true,
				description:
					"С какого устройства/браузера отправлено обращение. " +
					"Проставляется автоматически из заголовков запроса.",
			},
		},
	],
};
