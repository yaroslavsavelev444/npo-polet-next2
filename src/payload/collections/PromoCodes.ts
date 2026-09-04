import type { CollectionConfig } from "payload";
import {
	isValidPromoCodeFormat,
	normalizePromoCode,
	PROMO_CODE_MAX_LENGTH,
	PROMO_CODE_MIN_LENGTH,
} from "../../modules/promo/lib/promo-code.ts";
import { getRelationshipUser } from "../access/getRelationshipUser.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

export const PromoDiscountTypeValue = {
	PERCENTAGE: "percentage",
	FIXED: "fixed",
} as const;

/**
 * Промокоды — самостоятельная сущность, а не разновидность `discounts`.
 *
 * Общего с коллекцией скидок у неё нет намеренно: у промокода свой жизненный
 * цикл (его вводят вручную, он расходуется, он привязан к пользователю), свой
 * учёт активаций в отдельной коллекции `promo-code-redemptions` и свои
 * правила. Попытка выразить это полями `discounts` заставила бы половину её
 * полей быть «иногда значимыми», а вторую половину — мёртвыми для промокодов.
 *
 * ЧТЕНИЕ ЗАКРЫТО ДЛЯ ВСЕХ, КРОМЕ АДМИНИСТРАТОРОВ. Это не перестраховка:
 * открытый `read` у коллекции с кодами означает, что любой желающий выгружает
 * весь список действующих промокодов одним GET-запросом к /api/promo-codes.
 * Витрина читает коды только через сервис с `overrideAccess: true` и только
 * по точному совпадению кода, который покупатель уже знает.
 */
export const PromoCodes: CollectionConfig = {
	slug: "promo-codes",
	labels: {
		singular: "Промокод",
		plural: "Промокоды",
	},
	admin: {
		useAsTitle: "code",
		group: "E-Commerce",
		defaultColumns: [
			"code",
			"discountType",
			"isActive",
			"totalUses",
			"endAt",
			"updatedAt",
		],
		description:
			"Промокоды применяются покупателем вручную при оформлении заказа и не зависят от коллекции «Скидки».",
	},
	access: {
		read: isAdminOrSuperAdmin,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},
	hooks: {
		beforeChange: [
			({ req, data }) => {
				const author = getRelationshipUser(req);
				if (author) {
					if (!data.createdBy) data.createdBy = author;
					data.updatedBy = author;
				}
			},
		],
	},
	fields: [
		{
			name: "code",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: "Код",
			admin: {
				description:
					"Латиница, цифры, дефис и подчёркивание. Регистр не важен — код всегда сохраняется заглавными.",
			},
			hooks: {
				// Нормализация обязана происходить и здесь, и при вводе покупателем
				// одной и той же функцией: иначе «summer24», сохранённый админом,
				// не нашёлся бы по запросу «SUMMER24» от покупателя.
				beforeValidate: [
					({ value }) =>
						typeof value === "string" ? normalizePromoCode(value) : value,
				],
			},
			validate: (value: unknown) => {
				if (typeof value !== "string" || value === "") return "Укажите код";
				if (!isValidPromoCodeFormat(value)) {
					return `Код должен быть длиной от ${PROMO_CODE_MIN_LENGTH} до ${PROMO_CODE_MAX_LENGTH} символов и содержать только латиницу, цифры, дефис и подчёркивание`;
				}
				return true;
			},
		},
		{
			name: "description",
			type: "textarea",
			label: "Описание",
			admin: {
				description:
					"Для внутреннего использования — покупателю не показывается.",
			},
		},

		// ── Тип и величина скидки ─────────────────────────────────────────────
		{
			name: "discountType",
			type: "select",
			required: true,
			defaultValue: PromoDiscountTypeValue.PERCENTAGE,
			label: "Тип скидки",
			options: [
				{ label: "Процент от суммы", value: PromoDiscountTypeValue.PERCENTAGE },
				{ label: "Фиксированная сумма", value: PromoDiscountTypeValue.FIXED },
			],
		},
		{
			name: "discountPercent",
			type: "number",
			min: 0,
			max: 100,
			label: "Процент скидки",
			admin: {
				condition: (data) =>
					data?.discountType === PromoDiscountTypeValue.PERCENTAGE,
			},
			// Проверка обязательности живёт здесь, а не в required: поле значимо
			// только для одного типа, и required сделало бы невозможным
			// сохранение фиксированного кода.
			validate: (
				value: unknown,
				{ data }: { data: Record<string, unknown> },
			) => {
				if (data?.discountType !== PromoDiscountTypeValue.PERCENTAGE)
					return true;
				if (typeof value !== "number" || value <= 0) {
					return "Укажите процент скидки больше нуля";
				}
				return true;
			},
		},
		{
			name: "maxDiscountAmount",
			type: "number",
			min: 0,
			label: "Максимальная сумма скидки, ₽",
			admin: {
				condition: (data) =>
					data?.discountType === PromoDiscountTypeValue.PERCENTAGE,
				description:
					"Потолок для процентной скидки: «−20 %, но не более 5000 ₽». Пусто — без ограничения.",
			},
		},
		{
			name: "fixedAmount",
			type: "number",
			min: 0,
			label: "Сумма скидки, ₽",
			admin: {
				condition: (data) =>
					data?.discountType === PromoDiscountTypeValue.FIXED,
			},
			validate: (
				value: unknown,
				{ data }: { data: Record<string, unknown> },
			) => {
				if (data?.discountType !== PromoDiscountTypeValue.FIXED) return true;
				if (typeof value !== "number" || value <= 0) {
					return "Укажите сумму скидки больше нуля";
				}
				return true;
			},
		},

		// ── Условия применения ────────────────────────────────────────────────
		{
			name: "minOrderAmount",
			type: "number",
			min: 0,
			label: "Минимальная сумма заказа, ₽",
			admin: {
				description:
					"Считается по сумме товаров после товарных скидок и до корзинных. Пусто — без порога.",
			},
		},
		{
			name: "combinable",
			type: "checkbox",
			defaultValue: false,
			label: "Сочетается с другими скидками",
			admin: {
				description:
					"Выключено — промокод и действующая скидка взаимоисключают друг друга, применяется выгодная покупателю. Включено — промокод применяется поверх скидки, к остатку суммы.",
			},
		},

		// ── Срок действия ─────────────────────────────────────────────────────
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			index: true,
			label: "Активен",
		},
		{
			name: "startAt",
			type: "date",
			required: true,
			defaultValue: () => new Date().toISOString(),
			label: "Действует с",
		},
		{
			name: "endAt",
			type: "date",
			label: "Действует по",
			admin: { description: "Пусто — бессрочно." },
			validate: (
				value: unknown,
				{ data }: { data: Record<string, unknown> },
			) => {
				if (!value || !data?.startAt) return true;
				if (new Date(String(value)) <= new Date(String(data.startAt))) {
					return "Дата окончания должна быть позже даты начала";
				}
				return true;
			},
		},

		// ── Лимиты активаций ──────────────────────────────────────────────────
		{
			name: "maxUses",
			type: "number",
			min: 1,
			label: "Лимит активаций всего",
			admin: { description: "Пусто — без ограничения." },
		},
		{
			name: "maxUsesPerUser",
			type: "number",
			min: 1,
			label: "Лимит активаций на пользователя",
			admin: { description: "Пусто — без ограничения." },
		},

		// ── Область действия ──────────────────────────────────────────────────
		{
			name: "appliesToAllProducts",
			type: "checkbox",
			defaultValue: true,
			label: "Действует на все товары",
		},
		{
			name: "applicableCategories",
			type: "relationship",
			relationTo: "categories",
			hasMany: true,
			label: "Категории",
			admin: { condition: (data) => data?.appliesToAllProducts === false },
		},
		{
			name: "applicableProducts",
			type: "relationship",
			relationTo: "products",
			hasMany: true,
			label: "Товары",
			admin: { condition: (data) => data?.appliesToAllProducts === false },
		},

		// ── Статистика (только чтение) ────────────────────────────────────────
		{
			name: "totalUses",
			type: "number",
			defaultValue: 0,
			label: "Активаций",
			admin: {
				readOnly: true,
				description:
					"Непогашенные активации. Уменьшается при отмене заказа — см. коллекцию «Активации промокодов».",
			},
		},
		{
			name: "totalDiscountAmount",
			type: "number",
			defaultValue: 0,
			label: "Сумма предоставленных скидок, ₽",
			admin: { readOnly: true },
		},
		{
			name: "createdBy",
			type: "relationship",
			relationTo: "admins",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "updatedBy",
			type: "relationship",
			relationTo: "admins",
			admin: { readOnly: true, position: "sidebar" },
		},

		/**
		 * Действует ли код прямо сейчас — с учётом даты, флага и лимита.
		 * Виртуальное поле: администратору нужен ответ «работает / не
		 * работает», а не три поля, из которых его надо выводить в уме.
		 */
		{
			name: "isCurrentlyActive",
			type: "checkbox",
			virtual: true,
			label: "Действует сейчас",
			admin: { readOnly: true, position: "sidebar" },
			hooks: {
				afterRead: [
					({ data }) => {
						const now = new Date();
						if (!data?.isActive) return false;
						if (data.startAt && now < new Date(data.startAt)) return false;
						if (data.endAt && now > new Date(data.endAt)) return false;
						if (
							typeof data.maxUses === "number" &&
							(data.totalUses ?? 0) >= data.maxUses
						) {
							return false;
						}
						return true;
					},
				],
			},
		},
	],
	timestamps: true,
};
