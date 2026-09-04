// ─── Orders list & cancellation (append to existing file) ──────────────────

import type { Where } from "payload";
import { CheckoutSubmitInput } from "@/modules/checkout";
import { composeAddressLine } from "@/modules/checkout/lib/address";
import { resolveOrderContact } from "@/modules/orders/lib/order-contact";
import type { CheckoutPricing } from "@/modules/promo/lib/promo-resolution";
import type { PromoAcceptance } from "@/modules/promo/types";
import type { Order } from "../../../payload-types";
import { CartView } from "../../modules/cart";
import { createRelationshipUser } from "../access/createRelationshipUser";
import { getPayloadInstance } from "./getPayload";

export interface CreateOrderInput {
	userId: string;
	cart: CartView;
	form: CheckoutSubmitInput;
	meta: { ip: string; userAgent: string };
	/**
	 * Итоговые цены заказа — считаются вызывающим через
	 * `calculateCheckoutPricing`, а не здесь.
	 *
	 * Так снимок цен в заказе получается ровно тем же расчётом, который
	 * покупатель видел при нажатии «Применить»: одна функция, один результат.
	 * Считай их этот сервис самостоятельно — появилась бы вторая реализация
	 * порядка применения скидок, и разойтись они могли бы незаметно.
	 */
	pricing: CheckoutPricing;
	/**
	 * Применённый промокод — уже перепроверенный на сервере. null, если кода
	 * не было или он не применился.
	 */
	promo: PromoAcceptance | null;
}

export interface GetOrdersOptions {
	statuses?: Order["status"][] | null;
	page?: number;
	limit?: number;
}

export interface GetOrdersResult {
	docs: Order[];
	totalDocs: number;
	totalPages: number;
	page: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export async function getOrdersByUserId(
	userId: string,
	options: GetOrdersOptions = {},
): Promise<GetOrdersResult> {
	const payload = await getPayloadInstance();
	const { statuses, page = 1, limit = 10 } = options;

	const where: Where = {
		and: [
			{ user: { equals: userId } },
			...(statuses && statuses.length > 0
				? [{ status: { in: statuses } }]
				: []),
		],
	};

	const result = await payload.find({
		collection: "orders",
		where,
		sort: "-createdAt",
		page,
		limit,
		depth: 1,
		overrideAccess: true,
	});

	return {
		docs: result.docs as unknown as Order[],
		totalDocs: result.totalDocs,
		totalPages: result.totalPages,
		page: result.page ?? page,
		hasNextPage: result.hasNextPage,
		hasPrevPage: result.hasPrevPage,
	};
}

export async function getOrderByIdForUser(
	orderId: string,
	userId: string,
): Promise<Order | null> {
	const payload = await getPayloadInstance();

	let order: Order;
	try {
		order = (await payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 2,
			overrideAccess: true,
		})) as unknown as Order;
	} catch {
		return null;
	}

	if (!order) return null;

	const orderUserId =
		order.user && typeof order.user === "object" ? order.user.id : order.user;
	if (String(orderUserId) !== String(userId)) return null;

	return order;
}

export type CancelOrderFailureReason = "not_found" | "not_cancellable";

export async function cancelOrderForUser(
	orderId: string,
	userId: string,
	reason: string,
): Promise<
	| { ok: true; status: Order["status"] }
	| { ok: false; reason: CancelOrderFailureReason }
> {
	const payload = await getPayloadInstance();

	let order: Order;
	try {
		order = (await payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		})) as unknown as Order;
	} catch {
		return { ok: false, reason: "not_found" };
	}

	if (!order) return { ok: false, reason: "not_found" };

	const orderUserId =
		order.user && typeof order.user === "object" ? order.user.id : order.user;
	if (String(orderUserId) !== String(userId)) {
		return { ok: false, reason: "not_found" };
	}

	if (
		order.status === "cancelled" ||
		order.status === "refunded" ||
		order.status === "delivered"
	) {
		return { ok: false, reason: "not_cancellable" };
	}

	await payload.update({
		collection: "orders",
		id: orderId,
		data: {
			status: "cancelled",
			statusHistory: [
				...(order.statusHistory ?? []),
				{
					status: "cancelled",
					changedAt: new Date().toISOString(),
					changedBy: createRelationshipUser("users", userId),
					comment: reason,
				},
			],
		},
		overrideAccess: true,
	});

	return { ok: true, status: "cancelled" };
}

/**
 * Готовит адрес заказа к записи.
 *
 * Пустые строки превращаются в undefined: в форме «не заполнено» — это "",
 * а в базе должно быть NULL, иначе поле, которого у адреса нет (например,
 * район), сохранялось бы как пустая строка и отличалось бы от того же
 * поля у исторических заказов при любых выборках и сравнениях.
 *
 * `fullAddress` при ручном вводе собирается из компонентов здесь же, а не на
 * клиенте: заказ обязан нести читаемый адрес независимо от того, что прислала
 * форма.
 */
function buildOrderAddress(
	address: CheckoutSubmitInput["delivery"]["address"],
) {
	if (!address) return undefined;

	const value = (raw: string | undefined | null) => {
		const trimmed = typeof raw === "string" ? raw.trim() : "";
		return trimmed === "" ? undefined : trimmed;
	};

	return {
		fullAddress:
			value(address.fullAddress) ?? value(composeAddressLine(address)),
		postalCode: value(address.postalCode),
		country: value(address.country) ?? "Россия",
		region: value(address.region),
		area: value(address.area),
		city: value(address.city),
		settlement: value(address.settlement),
		street: value(address.street),
		house: value(address.house),
		block: value(address.block),
		apartment: value(address.apartment),
		entrance: value(address.entrance),
		floor: value(address.floor),
		fiasId: value(address.fiasId),
		fiasLevel: value(address.fiasLevel),
		kladrId: value(address.kladrId),
		geoLat: value(address.geoLat),
		geoLon: value(address.geoLon),
		qcGeo: value(address.qcGeo),
		source:
			address.source === "dadata" ? ("dadata" as const) : ("manual" as const),
	};
}

export async function createOrderFromCheckout({
	userId,
	cart,
	form,
	meta,
	pricing,
	promo,
}: CreateOrderInput) {
	const payload = await getPayloadInstance();

	const items = cart.items.map((item) => ({
		product: Number(item.product.id),
		name: item.product.title,
		quantity: item.quantity,
		unitPrice: item.unitPrice,
		discount: item.itemDiscount,
		totalPrice: item.subtotal,
	}));

	// Центральная скидка попадает в снимок заказа, ТОЛЬКО если она в нём
	// действительно участвовала. Промокод с combinable = false вытесняет её
	// целиком (см. promo-resolution), и записать её при этом означало бы
	// заказ, в котором перечислены скидки на большую сумму, чем в него
	// заложено — а расхождение снимка с итогом делает заказ неразбираемым.
	const appliedDiscounts = pricing.centralDiscountSuppressed
		? []
		: cart.discounts.applied.map((d) => ({
				discountId: Number(d.id),
				name: d.name,
				discountPercent: d.discountPercent,
				discountAmount: d.amount,
				message: d.message,
			}));

	const companyInfo = form.company?.isCompany
		? {
				companyId: form.company.existingCompanyId
					? Number(form.company.existingCompanyId)
					: undefined,
				name: form.company.companyName,
				legalAddress: form.company.legalAddress,
				companyAddress: form.company.companyAddress,
				taxNumber: form.company.taxNumber,
				contactPerson: form.company.contactPerson,
			}
		: undefined;

	// Единственное место, где решается «куда звонить по заказу»: тот же
	// резолвер работает в хуке коллекции и при чтении заказа, поэтому
	// расхождение между оформлением, админкой и письмами невозможно.
	const contact = resolveOrderContact({
		customerPhone: form.customer.phone,
		recipientPhone: form.recipient.phone,
		preferred: form.contactPreference,
	});

	const order = await payload.create({
		collection: "orders",
		data: {
			orderNumber: "",
			user: Number(userId),
			status: "pending",
			recipient: {
				fullName: form.recipient.fullName,
				// Пустая строка формы («получаю сам») должна лечь в базу как NULL:
				// у заказа либо есть отдельный номер получателя, либо его нет.
				phone: contact.recipientPhone || undefined,
				email: form.recipient.email,
			},
			contact: {
				phone: contact.phone,
				preferred: contact.owner ?? undefined,
				customerPhone: contact.customerPhone || undefined,
			},
			delivery: {
				method: form.delivery.method,
				// Самовывоз адреса не имеет вовсе — пункт выдачи хранится связью.
				address:
					form.delivery.method === "self_pickup"
						? undefined
						: buildOrderAddress(form.delivery.address),
				transportCompany: form.delivery.transportCompanyId
					? Number(form.delivery.transportCompanyId)
					: undefined,
				pickupPoint: form.delivery.pickupPointId
					? Number(form.delivery.pickupPointId)
					: undefined,
				notes: form.delivery.notes,
			},
			items,
			// Снимок цен берётся ЦЕЛИКОМ из расчёта, а не из витрины корзины:
			// корзина не знает о промокоде, и смешивать два источника значило бы
			// записать заказ, в котором сумма скидок не сходится с итогом.
			pricing: {
				subtotal: pricing.subtotal,
				productDiscounts: pricing.productDiscount,
				centralDiscountAmount: pricing.centralDiscountAmount,
				centralDiscountPercent: pricing.centralDiscountPercent,
				promoDiscountAmount: pricing.promoDiscountAmount,
				discount: pricing.totalDiscount,
				shippingCost: 0,
				total: pricing.total,
				currency: "RUB",
			},
			payment: {
				method: form.paymentMethod,
				status: "pending",
			},
			appliedDiscounts,
			// Снимок промокода: код и величина скидки на момент заказа.
			// Хранится копией, а не одной лишь связью, потому что промокод
			// живёт своей жизнью — его переименуют, отключат или удалят, а
			// заказ обязан навсегда объяснять, откуда взялась его скидка.
			promoCode: promo
				? {
						promoCodeId: Number(promo.promoCodeId),
						code: promo.code,
						discountType: promo.discountType,
						discountPercent: promo.discountPercent ?? undefined,
						discountAmount: promo.discountAmount,
					}
				: undefined,
			companyInfo,
			notes: form.notes,
			source: "web",
			ipAddress: meta.ip,
			userAgent: meta.userAgent,
			statusHistory: [
				{
					status: "pending",
					changedAt: new Date().toISOString(),
					comment: "Заказ создан",
				},
			],
		},
		overrideAccess: true,
		draft: false,
	});

	return order;
}

export async function getCachedOrderByOrderNumberForUser(
	orderNumber: string,
	userId: string,
) {
	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "orders",
		where: {
			and: [
				{ orderNumber: { equals: orderNumber } },
				{ user: { equals: userId } },
			],
		},
		limit: 1,
		depth: 2,
		overrideAccess: true,
	});
	return docs[0] ?? null;
}
