// scripts/db-migrate/migrations/orders.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyAddress {
	street?: string;
	city?: string;
	postalCode?: string;
	country?: string;
}

interface LegacyDelivery {
	method: string;
	address?: LegacyAddress;
	pickupPoint?: ObjectId;
	transportCompany?: ObjectId;
	trackingNumber?: string;
	estimatedDelivery?: Date;
	notes?: string;
}

interface LegacyRecipient {
	fullName: string;
	phone: string;
	email: string;
	contactPerson?: string;
}

interface LegacyCompanyInfo {
	companyId?: ObjectId;
	name?: string;
	address?: string;
	legalAddress?: string;
	taxNumber?: string;
	contactPerson?: string;
}

interface LegacyOrderItem {
	product: ObjectId;
	name?: string;
	quantity: number;
	unitPrice: number;
	discount?: number;
	totalPrice: number;
}

interface LegacyPricing {
	subtotal: number;
	discount?: number;
	shippingCost?: number;
	total: number;
	currency?: string;
	productDiscounts?: number;
	centralDiscountAmount?: number;
	centralDiscountPercent?: number;
}

interface LegacyPayment {
	method: string;
	status?: string;
	transactionId?: string;
	paidAt?: Date;
}

interface LegacyStatusHistoryEntry {
	status: string;
	changedAt?: Date;
	changedBy?: ObjectId;
	comment?: string;
}

interface LegacyAppliedDiscount {
	discountId?: ObjectId;
	name?: string;
	discountPercent?: number;
	discountAmount?: number;
}

interface LegacyOrder {
	_id: ObjectId;
	orderNumber: string;
	user?: ObjectId;
	delivery: LegacyDelivery;
	recipient: LegacyRecipient;
	companyInfo?: LegacyCompanyInfo;
	items: LegacyOrderItem[];
	pricing: LegacyPricing;
	payment: LegacyPayment;
	status: string;
	statusHistory?: LegacyStatusHistoryEntry[];
	appliedDiscounts?: LegacyAppliedDiscount[];
	notes?: string;
	internalNotes?: string;
	ipAddress?: string;
	userAgent?: string;
	source?: "web" | "mobile" | "api" | "admin";
}

// Поля старой модели без аналога в новой (не переносятся, см. обсуждение
// миграции): tax, priceWithoutDiscount (pricing), sku/weight/dimensions
// (items), delivery.carrier, cancellation, tags, companyCreated,
// companySelection, statusHistory[].metadata, appliedDiscounts[].{type,condition,appliedAt}.
//
// PaymentMethod: courier_cash/pickup_point_cash не существуют в новой схеме
// (валидны только при self_pickup, а эти заказы были при door_to_door/
// pickup_point) — по решению маппятся в invoice, с явной пометкой в
// internalNotes, что фактически была оплата наличными.
const PAYMENT_METHOD_MAP: Record<string, string> = {
	invoice: "invoice",
	self_pickup_card: "self_pickup_card",
	self_pickup_cash: "self_pickup_cash",
	courier_cash: "invoice",
	pickup_point_cash: "invoice",
};
const CASH_PAYMENT_NOTE: Record<string, string> = {
	courier_cash:
		"[Миграция] Изначально оплата наличными курьеру (courier_cash).",
	pickup_point_cash:
		"[Миграция] Изначально оплата наличными в ПВЗ (pickup_point_cash).",
};

const SOURCE_MAP: Record<string, string> = {
	web: "web",
	mobile: "mobile",
	admin: "admin",
	api: "web",
};

export default defineMigration({
	slug: "orders",
	dependsOn: [
		"users",
		"products",
		"pickupPoints",
		"transportCompanies",
		"companies",
		"discounts",
	],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyOrder>(LEGACY_COLLECTIONS.orders)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			// user не required в новой схеме (заказы обезличиваются при удалении
			// аккаунта) — если ссылка не резолвится, заказ всё равно переносим
			// с user: undefined, а не пропускаем: это финансовые/бухгалтерские
			// данные, терять которые нельзя даже без владельца.
			const userId = old.user
				? await resolveRef(ctx, "users", old.user.toString())
				: undefined;

			const items: Array<{
				product: string | number;
				name: string;
				quantity: number;
				unitPrice: number;
				discount: number;
				totalPrice: number;
			}> = [];
			let unresolvedItems = 0;
			for (const item of old.items ?? []) {
				const productId = await resolveRef(
					ctx,
					"products",
					item.product?.toString(),
				);
				if (!productId) {
					unresolvedItems++;
					continue;
				}
				items.push({
					product: productId,
					name: item.name ?? "",
					quantity: item.quantity,
					unitPrice: item.unitPrice,
					discount: item.discount ?? 0,
					totalPrice: item.totalPrice,
				});
			}
			if (unresolvedItems > 0) {
				log.warn(
					`Заказ ${old.orderNumber} (${legacyId}): ${unresolvedItems} позиций пропущено (товар не найден)`,
				);
			}
			if (items.length === 0) {
				// items — minRows: 1 в новой схеме, заказ без единой резолвящейся
				// позиции сохранить невозможно корректно.
				stats.skipped++;
				log.warn(
					`Заказ ${old.orderNumber} (${legacyId}): ни одна позиция не резолвится, пропуск`,
				);
				continue;
			}

			const transportCompanyId = old.delivery?.transportCompany
				? await resolveRef(
						ctx,
						"transport-companies",
						old.delivery.transportCompany.toString(),
					)
				: undefined;
			const pickupPointId = old.delivery?.pickupPoint
				? await resolveRef(
						ctx,
						"pickup-points",
						old.delivery.pickupPoint.toString(),
					)
				: undefined;
			const companyId = old.companyInfo?.companyId
				? await resolveRef(
						ctx,
						"companies",
						old.companyInfo.companyId.toString(),
					)
				: undefined;

			const statusHistory: Array<{
				status: string;
				changedAt?: string;
				changedBy?: string | number;
				comment?: string;
			}> = [];
			for (const h of old.statusHistory ?? []) {
				// changedBy почти всегда персонал в старой системе — персонал не
				// мигрируется, поэтому ссылка часто останется неразрешённой, это
				// ожидаемо (см. users.migration.ts).
				const changedBy = h.changedBy
					? await resolveRef(ctx, "users", h.changedBy.toString())
					: undefined;
				statusHistory.push({
					status: h.status,
					changedAt: h.changedAt
						? new Date(h.changedAt).toISOString()
						: undefined,
					changedBy,
					comment: h.comment,
				});
			}

			const appliedDiscounts: Array<{
				discountId?: string | number;
				name?: string;
				discountPercent?: number;
				discountAmount?: number;
			}> = [];
			for (const d of old.appliedDiscounts ?? []) {
				const discountId = d.discountId
					? await resolveRef(ctx, "discounts", d.discountId.toString())
					: undefined;
				appliedDiscounts.push({
					discountId,
					name: d.name,
					discountPercent: d.discountPercent,
					discountAmount: d.discountAmount,
				});
			}

			const paymentMethod =
				PAYMENT_METHOD_MAP[old.payment?.method] ?? "invoice";
			const cashNote = CASH_PAYMENT_NOTE[old.payment?.method];
			const internalNotes = cashNote
				? [old.internalNotes, cashNote].filter(Boolean).join("\n")
				: old.internalNotes;

			const result = await upsertByLegacyId({
				ctx,
				collection: "orders",
				legacyId,
				data: {
					orderNumber: old.orderNumber,
					user: userId,
					status: old.status,
					recipient: {
						fullName: old.recipient?.fullName,
						phone: old.recipient?.phone,
						email: old.recipient?.email,
						contactPerson: old.recipient?.contactPerson,
					},
					delivery: {
						method: old.delivery?.method,
						address: old.delivery?.address
							? {
									street: old.delivery.address.street,
									city: old.delivery.address.city,
									postalCode: old.delivery.address.postalCode,
									country: old.delivery.address.country ?? "Россия",
								}
							: undefined,
						transportCompany: transportCompanyId,
						pickupPoint: pickupPointId,
						trackingNumber: old.delivery?.trackingNumber,
						estimatedDelivery: old.delivery?.estimatedDelivery
							? new Date(old.delivery.estimatedDelivery).toISOString()
							: undefined,
						notes: old.delivery?.notes,
					},
					items,
					pricing: {
						subtotal: old.pricing?.subtotal ?? 0,
						productDiscounts: old.pricing?.productDiscounts ?? 0,
						centralDiscountAmount: old.pricing?.centralDiscountAmount ?? 0,
						centralDiscountPercent: old.pricing?.centralDiscountPercent ?? 0,
						discount: old.pricing?.discount ?? 0,
						shippingCost: old.pricing?.shippingCost ?? 0,
						total: old.pricing?.total ?? 0,
						currency: old.pricing?.currency ?? "RUB",
					},
					payment: {
						method: paymentMethod,
						status: old.payment?.status ?? "pending",
						transactionId: old.payment?.transactionId,
						paidAt: old.payment?.paidAt
							? new Date(old.payment.paidAt).toISOString()
							: undefined,
					},
					appliedDiscounts,
					companyInfo:
						companyId || old.companyInfo?.name
							? {
									companyId,
									name: old.companyInfo?.name,
									legalAddress: old.companyInfo?.legalAddress,
									companyAddress: old.companyInfo?.address,
									taxNumber: old.companyInfo?.taxNumber,
									contactPerson: old.companyInfo?.contactPerson,
								}
							: undefined,
					notes: old.notes,
					internalNotes,
					statusHistory,
					source: SOURCE_MAP[old.source ?? "web"] ?? "web",
					ipAddress: old.ipAddress,
					userAgent: old.userAgent,
				},
				context: { isMigration: true },
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести заказ ${old.orderNumber} (${legacyId})`,
					{
						error:
							result.error instanceof Error
								? result.error.message
								: String(result.error),
					},
				);
				continue;
			}

			stats[result.action]++;
		}

		return stats;
	},
});
