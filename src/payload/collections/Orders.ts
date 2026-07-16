import type { CollectionConfig } from "payload";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { notifyNewOrder } from "../../services/notifications/notifyNewOrder.ts";
import {
	notifyOrderCancelled,
	notifyOrderStatusChanged,
} from "../../services/notifications/notifyOrderStatusChanged.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isLoggedIn } from "../access/isLoggedIn.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { legacyIdField } from "../fields/legacyId.ts";

/** Заказы после удаления аккаунта обезличиваются (user становится пустым) — для них in-app уведомление создавать некому. */
function getOrderUserId(doc: { user?: unknown }): number | null {
	const { user } = doc;
	if (typeof user === "number") return user;
	if (user && typeof user === "object" && "id" in user) {
		return Number((user as { id: unknown }).id);
	}
	return null;
}

// ─── Enums ──────────────────────────────────────────────────────────────────

export const OrderStatus = {
	PENDING: "pending",
	CONFIRMED: "confirmed",
	PROCESSING: "processing",
	// PACKED и READY_FOR_PICKUP существовали в старой системе и добавлены сюда
	// конкретно для сохранения точности статусов при переносе исторических
	// заказов (scripts/db-migrate/migrations/orders.migration.ts) — не только
	// ради самой миграции, но и как значимые самостоятельные статусы.
	PACKED: "packed",
	SHIPPED: "shipped",
	READY_FOR_PICKUP: "ready_for_pickup",
	DELIVERED: "delivered",
	CANCELLED: "cancelled",
	REFUNDED: "refunded",
	AWAITING_INVOICE: "awaiting_invoice",
} as const;
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * door_to_door — courier delivery to a street address (requires TransportCompany + address)
 * pickup_point — delivery to a carrier's own PVZ network (requires TransportCompany + destination city)
 * self_pickup  — pickup from one of OUR PickupPoints (requires PickupPoint relation)
 *
 * Deliberately distinct from the old project's model, which conflated "carrier"
 * and "carrier's PVZ" under one bucket and had no representation of our own
 * pickup points at all.
 */
export const DeliveryMethod = {
	DOOR_TO_DOOR: "door_to_door",
	PICKUP_POINT: "pickup_point",
	SELF_PICKUP: "self_pickup",
} as const;
export type DeliveryMethodType =
	(typeof DeliveryMethod)[keyof typeof DeliveryMethod];

/**
 * Intentionally only 3 methods, matching the checkout module's requirements.
 * self_pickup_* are only valid when delivery.method === self_pickup — enforced
 * server-side in modules/checkout/lib/payment-compatibility.ts, not here, so
 * the collection schema stays a pure data contract.
 */
export const PaymentMethod = {
	INVOICE: "invoice",
	SELF_PICKUP_CARD: "self_pickup_card",
	SELF_PICKUP_CASH: "self_pickup_cash",
} as const;
export type PaymentMethodType =
	(typeof PaymentMethod)[keyof typeof PaymentMethod];

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Номер следующего заказа = (максимальный уже существующий номер за год) + 1.
 *
 * Раньше считалось количество заказов за год (`totalDocs + 1`). Это неверно
 * сразу по двум причинам, и обе становятся критичными после переноса
 * исторических заказов из старой системы (scripts/db-migrate):
 *
 * 1. Количество ≠ последний номер. Перенесённые заказы занимают номера
 *    ORD-{год}-000001…N, при этом их createdAt — момент миграции, то есть они
 *    попадали в счётчик текущего года. Любой пропуск или удаление в
 *    нумерации приводили к тому, что count+1 указывал на УЖЕ ЗАНЯТЫЙ номер —
 *    а orderNumber уникален, значит падало бы оформление заказа у живого
 *    покупателя.
 * 2. Фильтр по createdAt вообще не связан с номером: заказ, созданный в этом
 *    году, может нести номер прошлого года (перенесённый) — и наоборот.
 *
 * Берём максимум по самому полю orderNumber: нумерация с нулями до 6 знаков,
 * поэтому лексикографическая сортировка совпадает с числовой. parseInt
 * останавливается на первом не-цифре и потому корректно читает и номера с
 * суффиксом -L<legacyId>, который миграция даёт заказам, чей исходный номер
 * уже был занят (см. resolveFreeOrderNumber в orders.migration.ts).
 */
const generateOrderNumber = async ({ operation, data, req }: any) => {
	// Только при создании
	if (operation !== "create") return data;

	// Если номер уже есть и он не пустой — ничего не делаем (миграция
	// проставляет номер исторического заказа сама).
	if (data?.orderNumber && data.orderNumber !== "") {
		return data;
	}

	const year = new Date().getFullYear();
	const prefix = `ORD-${year}-`;

	const { docs } = await req.payload.find({
		collection: "orders",
		where: { orderNumber: { like: prefix } },
		sort: "-orderNumber",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	const lastNumber: string | undefined = docs[0]?.orderNumber;
	const lastSequence = lastNumber?.startsWith(prefix)
		? Number.parseInt(lastNumber.slice(prefix.length), 10)
		: 0;

	const nextNumber = ((Number.isNaN(lastSequence) ? 0 : lastSequence) + 1)
		.toString()
		.padStart(6, "0");
	data.orderNumber = `${prefix}${nextNumber}`;

	return data;
};

// ─── Collection ─────────────────────────────────────────────────────────────

export const Orders: CollectionConfig = {
	slug: "orders",

	admin: {
		useAsTitle: "orderNumber",
		defaultColumns: [
			"orderNumber",
			"status",
			"recipient",
			"pricing",
			"createdAt",
		],
		group: "Магазин",
	},

	access: {
		// Покупатель видит только свои заказы, персонал — все.
		// Проверка «свой/чужой» вынесена в ownedByUserOrStaff: раньше здесь
		// сравнивалась только req.user.role, без коллекции, и покупатель с
		// role=superadmin читал заказы всех пользователей (ФИО получателей,
		// телефоны, состав, суммы) через GET /api/orders.
		read: ownedByUserOrStaff,
		create: isLoggedIn,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeChange: [generateOrderNumber],
		afterChange: [
			async ({ doc, previousDoc, operation, req }) => {
				// scripts/db-migrate/migrations/orders.migration.ts переносит
				// исторические заказы пачками через create/update — без этого флага
				// каждый перенесённый заказ рассылал бы "новый заказ"/смену статуса
				// реальным получателям.
				if (req.context?.isMigration) return doc;

				const userId = getOrderUserId(doc);

				if (operation === "create") {
					void notifyNewOrder(doc, req.payload); // явная передача, без нового импорта getPayload
					if (userId) {
						void notify(req.payload, userId, "order_created", {
							orderNumber: doc.orderNumber,
							itemsCount: doc.items?.length ?? 0,
						});
					}
					return doc;
				}

				// update: реагируем только на реальную смену статуса
				if (previousDoc?.status === doc.status) return doc;

				if (doc.status === "cancelled") {
					// Инициатор: если запрос пришёл с ролью user (не admin/superadmin) —
					// значит отменил сам покупатель через свой Server Action (isLoggedIn
					// на update сейчас разрешён только admin, поэтому на практике
					// отмена клиентом должна идти через отдельный override-access вызов
					// из cancelOrderForUser с флагом в req.context).
					const initiatedBy: "customer" | "admin" =
						req.context?.initiatedByCustomer === true ? "customer" : "admin";
					void notifyOrderCancelled(doc, initiatedBy);
					if (userId) {
						void notify(req.payload, userId, "order_cancelled", {
							orderNumber: doc.orderNumber,
							initiatedBy,
						});
					}
					return doc;
				}

				void notifyOrderStatusChanged(doc);
				if (userId) {
					void notify(req.payload, userId, "order_status_changed", {
						orderNumber: doc.orderNumber,
						status: doc.status,
					});
				}
				return doc;
			},
		],
	},

	fields: [
		{
			name: "orderNumber",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				readOnly: true,
				position: "sidebar",
				description: "Генерируется автоматически",
			},
		},

		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: {
				position: "sidebar",
				description: "Пусто у заказов, обезличенных после удаления аккаунта",
			},
		},

		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: OrderStatus.PENDING,
			index: true,
			options: [
				{ label: "Ожидает подтверждения", value: OrderStatus.PENDING },
				{ label: "Подтверждён", value: OrderStatus.CONFIRMED },
				{ label: "В обработке", value: OrderStatus.PROCESSING },
				{ label: "Упакован", value: OrderStatus.PACKED },
				{ label: "Отправлен", value: OrderStatus.SHIPPED },
				{ label: "Готов к выдаче", value: OrderStatus.READY_FOR_PICKUP },
				{ label: "Доставлен", value: OrderStatus.DELIVERED },
				{ label: "Отменён", value: OrderStatus.CANCELLED },
				{ label: "Возврат", value: OrderStatus.REFUNDED },
				{ label: "Ожидает счёта", value: OrderStatus.AWAITING_INVOICE },
			],
			admin: { position: "sidebar" },
		},

		// ── Получатель ─────────────────────────────────────────────────────────
		{
			name: "recipient",
			type: "group",
			label: "Получатель",
			fields: [
				{ name: "fullName", type: "text", required: true },
				{ name: "phone", type: "text", required: true },
				{ name: "email", type: "email", required: true },
				{ name: "contactPerson", type: "text" },
			],
		},

		// ── Доставка ───────────────────────────────────────────────────────────
		{
			name: "delivery",
			type: "group",
			label: "Доставка",
			fields: [
				{
					name: "method",
					type: "select",
					required: true,
					defaultValue: DeliveryMethod.SELF_PICKUP,
					options: [
						{ label: "Курьер до двери", value: DeliveryMethod.DOOR_TO_DOOR },
						{
							label: "Доставка в ПВЗ транспортной компании",
							value: DeliveryMethod.PICKUP_POINT,
						},
						{ label: "Самовывоз", value: DeliveryMethod.SELF_PICKUP },
					],
				},
				{
					name: "address",
					type: "group",
					label: "Адрес",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.DOOR_TO_DOOR ||
							siblingData?.method === DeliveryMethod.PICKUP_POINT,
					},
					fields: [
						{ name: "street", type: "text" },
						{ name: "city", type: "text" },
						{ name: "postalCode", type: "text" },
						{ name: "country", type: "text", defaultValue: "Россия" },
					],
				},
				{
					name: "transportCompany",
					type: "relationship",
					relationTo: "transport-companies",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.DOOR_TO_DOOR ||
							siblingData?.method === DeliveryMethod.PICKUP_POINT,
					},
				},
				{
					name: "pickupPoint",
					type: "relationship",
					relationTo: "pickup-points",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.SELF_PICKUP,
					},
				},
				{ name: "trackingNumber", type: "text", admin: { readOnly: true } },
				{ name: "estimatedDelivery", type: "date" },
				{ name: "notes", type: "textarea", label: "Комментарий к доставке" },
			],
		},

		// ── Позиции заказа (снимок на момент оформления) ─────────────────────
		{
			name: "items",
			type: "array",
			label: "Позиции заказа",
			minRows: 1,
			fields: [
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
				},
				{
					name: "name",
					type: "text",
					required: true,
					label: "Название (снимок)",
				},
				{ name: "quantity", type: "number", required: true, min: 1 },
				{ name: "unitPrice", type: "number", required: true, min: 0 },
				{ name: "discount", type: "number", defaultValue: 0, min: 0 },
				{ name: "totalPrice", type: "number", required: true, min: 0 },
			],
		},

		// ── Ценообразование (снимок из CartView.summary) ─────────────────────
		{
			name: "pricing",
			type: "group",
			label: "Стоимость",
			fields: [
				{ name: "subtotal", type: "number", required: true, min: 0 },
				{ name: "productDiscounts", type: "number", defaultValue: 0, min: 0 },
				{
					name: "centralDiscountAmount",
					type: "number",
					defaultValue: 0,
					min: 0,
				},
				{
					name: "centralDiscountPercent",
					type: "number",
					defaultValue: 0,
					min: 0,
					max: 100,
				},
				{
					name: "discount",
					type: "number",
					defaultValue: 0,
					min: 0,
					label: "Скидка (итого)",
				},
				{ name: "shippingCost", type: "number", defaultValue: 0, min: 0 },
				{ name: "total", type: "number", required: true, min: 0 },
				{
					name: "currency",
					type: "text",
					defaultValue: "RUB",
					admin: { position: "sidebar" },
				},
			],
		},

		// ── Оплата ─────────────────────────────────────────────────────────────
		{
			name: "payment",
			type: "group",
			label: "Оплата",
			fields: [
				{
					name: "method",
					type: "select",
					required: true,
					options: [
						{
							label: "Банковский перевод по счету",
							value: PaymentMethod.INVOICE,
						},
						{
							label: "Картой при самовывозе",
							value: PaymentMethod.SELF_PICKUP_CARD,
						},
						{
							label: "Наличными при самовывозе",
							value: PaymentMethod.SELF_PICKUP_CASH,
						},
					],
				},
				{
					name: "status",
					type: "select",
					defaultValue: "pending",
					index: true,
					options: [
						{ label: "Ожидает", value: "pending" },
						{ label: "Оплачен", value: "paid" },
						{ label: "Ошибка", value: "failed" },
						{ label: "Возврат", value: "refunded" },
					],
				},
				{ name: "transactionId", type: "text" },
				{ name: "paidAt", type: "date" },
				// Attached by admin after order is placed (e.g. invoice PDF for `invoice` method)
				{ name: "invoiceFile", type: "relationship", relationTo: "media" },
			],
		},

		// ── Применённые скидки (снимок из CartView.discounts.applied) ────────
		{
			name: "appliedDiscounts",
			type: "array",
			label: "Применённые скидки",
			fields: [
				{ name: "discountId", type: "relationship", relationTo: "discounts" },
				{ name: "name", type: "text" },
				{ name: "discountPercent", type: "number" },
				{ name: "discountAmount", type: "number" },
				{ name: "message", type: "text" },
			],
		},

		// ── Компания (юр. лицо) ───────────────────────────────────────────────
		{
			name: "companyInfo",
			type: "group",
			label: "Организация",
			admin: {
				condition: (data) =>
					Boolean(data?.companyInfo?.companyId || data?.companyInfo?.name),
			},
			fields: [
				{ name: "companyId", type: "relationship", relationTo: "companies" },
				{ name: "name", type: "text" },
				{ name: "legalAddress", type: "text" },
				{ name: "companyAddress", type: "text" },
				{ name: "taxNumber", type: "text" },
				{ name: "contactPerson", type: "text" },
			],
		},

		{ name: "notes", type: "textarea", label: "Примечания к заказу" },
		{
			name: "internalNotes",
			type: "textarea",
			label: "Внутренние заметки",
			admin: { condition: () => false },
		},

		{
			name: "statusHistory",
			type: "array",
			label: "История статусов",
			admin: { readOnly: true },
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: Object.values(OrderStatus).map((s) => ({
						label: s,
						value: s,
					})),
				},
				{
					name: "changedAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
				},
				{
					name: "changedBy",
					type: "relationship",
					relationTo: ["users", "admins"],
				},
				{ name: "comment", type: "text" },
			],
		},

		{
			name: "source",
			type: "select",
			defaultValue: "web",
			options: [
				{ label: "Сайт", value: "web" },
				{ label: "Мобильное", value: "mobile" },
				{ label: "Админ", value: "admin" },
			],
			admin: { position: "sidebar" },
		},
		{ name: "ipAddress", type: "text", admin: { readOnly: true } },
		{ name: "userAgent", type: "text", admin: { readOnly: true } },

		legacyIdField,
	],
};
