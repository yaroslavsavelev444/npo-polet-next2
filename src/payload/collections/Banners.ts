import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const BannerAction = {
	None: "none",
	Link: "link",
	Modal: "modal",
	Redirect: "redirect",
} as const;

export type BannerActionType = (typeof BannerAction)[keyof typeof BannerAction];

export const BannerStatus = {
	Draft: "draft",
	Active: "active",
	Scheduled: "scheduled",
	Archived: "archived",
} as const;

export type BannerStatusType = (typeof BannerStatus)[keyof typeof BannerStatus];

// ─── Collection ───────────────────────────────────────────────────────────────

/**
 * Banners — промо-баннеры на сайте.
 *
 * Особенности:
 *  - startAt / endAt — плановое расписание показа
 *  - targeting.roles — показ только определённым ролям
 *  - priority — сортировка при отображении нескольких баннеров
 *  - Payload Versions + drafts позволяют готовить баннер заранее
 */
export const Banners: CollectionConfig = {
	slug: "banners",

	admin: {
		useAsTitle: "title",
		defaultColumns: [
			"title",
			"status",
			"action",
			"priority",
			"startAt",
			"endAt",
		],
		group: "Контент",
		description: "Промо-баннеры и системные уведомления",
	},

	// Черновики — удобно готовить баннер заранее и публиковать по расписанию
	versions: {
		drafts: true,
	},

	access: {
		// Публичное чтение — фронтенд сам фильтрует по статусу и датам
		read: () => true,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},
	hooks: {
		// getCachedBanners кэширует список с revalidate:false — без этого хука
		// изменения баннеров не появлялись бы на сайте до редеплоя.
		afterChange: [createRevalidateCacheHook("banners")],
		afterDelete: [createRevalidateCacheHook("banners")],
	},

	fields: [
		// ── Контент ──────────────────────────────────────────────────────────────
		{
			name: "title",
			type: "text",
			required: true,
			label: "Заголовок",
		},
		{
			name: "subtitle",
			type: "text",
			label: "Подзаголовок",
		},
		{
			name: "description",
			type: "textarea",
			label: "Описание",
		},

		// ── Медиа ────────────────────────────────────────────────────────────────
		{
			name: "media",
			type: "relationship",
			relationTo: "media",
			hasMany: true,
			label: "Изображения / видео",
		},

		// ── Действие (CTA) ───────────────────────────────────────────────────────
		{
			name: "action",
			type: "select",
			defaultValue: BannerAction.None,
			label: "Действие при клике",
			options: [
				{ label: "Без действия", value: BannerAction.None },
				{ label: "Ссылка", value: BannerAction.Link },
				{ label: "Модальное окно", value: BannerAction.Modal },
				{ label: "Редирект", value: BannerAction.Redirect },
			],
		},
		{
			name: "actionPayload",
			type: "text",
			label: "Параметр действия",
			admin: {
				description: "URL для Link/Redirect, ID модалки для Modal",
				condition: (data) => data?.action && data.action !== BannerAction.None,
			},
		},

		// ── Расписание ───────────────────────────────────────────────────────────
		{
			name: "startAt",
			type: "date",
			label: "Показывать с",
			defaultValue: () => new Date().toISOString(),
			admin: {
				position: "sidebar",
				date: { pickerAppearance: "dayAndTime" },
			},
		},
		{
			name: "endAt",
			type: "date",
			label: "Показывать до",
			admin: {
				position: "sidebar",
				date: { pickerAppearance: "dayAndTime" },
				description: "Оставьте пустым для бессрочного показа",
			},
		},
		{
			name: "repeatable",
			type: "checkbox",
			defaultValue: false,
			label: "Повторять после закрытия пользователем",
			admin: { position: "sidebar" },
		},

		// ── Отображение ──────────────────────────────────────────────────────────
		{
			name: "priority",
			type: "number",
			defaultValue: 0,
			label: "Приоритет (чем выше, тем важнее)",
			admin: { position: "sidebar" },
		},
		{
			name: "status",
			type: "select",
			defaultValue: BannerStatus.Draft,
			index: true,
			label: "Статус",
			options: [
				{ label: "Черновик", value: BannerStatus.Draft },
				{ label: "Активен", value: BannerStatus.Active },
				{ label: "Запланирован", value: BannerStatus.Scheduled },
				{ label: "Архив", value: BannerStatus.Archived },
			],
			admin: { position: "sidebar" },
		},
		{
			name: "isSystem",
			type: "checkbox",
			defaultValue: false,
			label: "Системный (нельзя закрыть)",
			admin: { position: "sidebar" },
		},

		// ── Таргетинг ────────────────────────────────────────────────────────────
		{
			name: "targeting",
			type: "group",
			label: "Таргетинг",
			fields: [
				{
					name: "roles",
					type: "select",
					hasMany: true,
					label: "Показывать только ролям",
					admin: {
						description: "Оставьте пустым — баннер виден всем",
					},
					options: [
						{ label: "Пользователь", value: "user" },
						{ label: "Юрист", value: "lawyer" },
						{ label: "Администратор", value: "admin" },
						{ label: "Модератор", value: "moderator" },
					],
				},
			],
		},
	],
};

// ─── Серверный хелпер ─────────────────────────────────────────────────────────

/**
 * Возвращает активные баннеры для указанной роли.
 * Использовать в Server Components / Route Handlers.
 *
 * @example
 * const banners = await getActiveBanners(payload, 'user')
 */
export async function getActiveBanners(payload: any, role?: string) {
	const now = new Date().toISOString();

	const { docs } = await payload.find({
		collection: "banners",
		where: {
			and: [
				{ status: { equals: BannerStatus.Active } },
				{
					or: [
						{ startAt: { less_than_equal: now } },
						{ startAt: { exists: false } },
					],
				},
				{
					or: [{ endAt: { greater_than: now } }, { endAt: { exists: false } }],
				},
			],
		},
		sort: "-priority",
		depth: 1,
	});

	if (!role) return docs;

	// Фильтрация по роли: если targeting.roles пустой — баннер для всех
	return docs.filter((b: any) => {
		const roles: string[] = b.targeting?.roles ?? [];
		return roles.length === 0 || roles.includes(role);
	});
}
