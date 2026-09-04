import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

export const PromoRedemptionStatus = {
	APPLIED: "applied",
	REVOKED: "revoked",
} as const;

/**
 * Журнал активаций промокодов: одна строка — один заказ, оформленный с кодом.
 *
 * Отдельная коллекция, а не счётчик в самом промокоде, потому что счётчика
 * недостаточно сразу для двух требований:
 *
 *  • «лимит активаций на пользователя» — на него нельзя ответить одним
 *    числом, нужен ответ на вопрос «сколько раз ЭТОТ покупатель применил
 *    ЭТОТ код», то есть выборка по паре (код, пользователь);
 *  • возврат активации при отмене заказа — чтобы уменьшить счётчик
 *    безопасно, надо знать, что именно этот заказ его увеличивал, иначе
 *    повторная отмена (или отмена заказа без промокода) уводила бы счётчик
 *    в минус.
 *
 * Записи создаются ТОЛЬКО сервисом промокодов (`overrideAccess: true`) в той
 * же операции, что и изменение счётчика. Ручное создание и правка запрещены
 * всем, включая администраторов: строка журнала и счётчик кода обязаны
 * меняться вместе, а правка в админке изменила бы только одну сторону и
 * рассинхронизировала бы учёт.
 */
export const PromoCodeRedemptions: CollectionConfig = {
	slug: "promo-code-redemptions",
	labels: {
		singular: "Активация промокода",
		plural: "Активации промокодов",
	},
	admin: {
		useAsTitle: "code",
		group: "E-Commerce",
		defaultColumns: [
			"code",
			"user",
			"order",
			"discountAmount",
			"status",
			"createdAt",
		],
		description:
			"Журнал только для чтения. Записи создаются при оформлении заказа и погашаются при его отмене.",
	},
	access: {
		read: isAdminOrSuperAdmin,
		create: () => false,
		update: () => false,
		delete: () => false,
	},
	fields: [
		{
			name: "promoCode",
			type: "relationship",
			relationTo: "promo-codes",
			required: true,
			index: true,
			label: "Промокод",
		},
		{
			name: "code",
			type: "text",
			required: true,
			index: true,
			label: "Код (снимок)",
			admin: {
				description:
					"Код на момент активации. Хранится копией: переименование промокода не должно менять историю заказов.",
			},
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Покупатель",
		},
		{
			name: "order",
			type: "relationship",
			relationTo: "orders",
			index: true,
			label: "Заказ",
		},
		{
			name: "discountAmount",
			type: "number",
			required: true,
			min: 0,
			label: "Сумма скидки, ₽",
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: PromoRedemptionStatus.APPLIED,
			index: true,
			label: "Статус",
			options: [
				{ label: "Активна", value: PromoRedemptionStatus.APPLIED },
				{ label: "Погашена", value: PromoRedemptionStatus.REVOKED },
			],
			admin: {
				description:
					"«Погашена» — заказ отменён, активация возвращена в лимит промокода.",
			},
		},
		{
			name: "revokedAt",
			type: "date",
			label: "Погашена",
			admin: { condition: (data) => Boolean(data?.revokedAt) },
		},
		{
			name: "revokeReason",
			type: "text",
			label: "Причина погашения",
			admin: { condition: (data) => Boolean(data?.revokedAt) },
		},
	],
	timestamps: true,
};
