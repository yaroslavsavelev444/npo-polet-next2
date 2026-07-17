// scripts/db-migrate/migrations/orders.migration.ts
import type { ObjectId } from "mongodb";
import type { MigrationContext } from "../core/index.ts";
import {
	defineMigration,
	emptyStats,
	extractUniqueConstraintFieldPaths,
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
	/** Старая схема — mongoose с { timestamps: true }, поле есть у всех заказов. */
	createdAt?: Date;
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

// door_to_door/pickup_point/self_pickup — единственные валидные значения в
// новой схеме (см. src/payload/collections/Orders.ts). У части старых
// заказов встречаются значения вне этого набора (пустое/legacy) — вместо
// падения всего заказа подставляем самый безопасный вариант (не требует
// адреса/транспортной компании) и явно логируем исходное значение, чтобы
// решить вручную по конкретным заказам.
const VALID_DELIVERY_METHODS = new Set([
	"door_to_door",
	"pickup_point",
	"self_pickup",
]);
const FALLBACK_DELIVERY_METHOD = "self_pickup";

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
		let ownerlessOrders = 0;
		let renumberedOrders = 0;

		const cursor = legacyDb
			.collection<LegacyOrder>(LEGACY_COLLECTIONS.orders)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			// user не required в новой схеме (заказы обезличиваются при удалении
			// аккаунта) — если ссылка не резолвится, заказ всё равно переносим
			// с user: undefined, а не пропускаем: это финансовые/бухгалтерские
			// данные, терять которые нельзя даже без владельца.
			//
			// Но такой заказ не виден никому в «Мои заказы», поэтому молчать об
			// этом нельзя — раньше он создавался без единой строчки в логе.
			// Причина почти всегда одна из двух: владелец — персонал старой
			// системы (role admin/superadmin не мигрируется by design), либо
			// его перенос не удался (см. users.migration.ts).
			const userId = old.user
				? await resolveRef(ctx, "users", old.user.toString())
				: undefined;
			if (old.user && userId === undefined) {
				ownerlessOrders++;
				log.warn(
					`Заказ ${old.orderNumber} (${legacyId}): владелец ${old.user.toString()} не найден в новой БД — заказ переносится БЕЗ владельца и не будет виден в «Мои заказы»`,
				);
			}

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
				changedBy?: { relationTo: "users"; value: string | number };
				comment?: string;
			}> = [];
			for (const h of old.statusHistory ?? []) {
				// changedBy почти всегда персонал в старой системе — персонал не
				// мигрируется, поэтому ссылка часто останется неразрешённой, это
				// ожидаемо (см. users.migration.ts). relationTo в новой схеме
				// полиморфный (["users", "admins"]) — Payload ждёт значение вида
				// {relationTo, value}, а не голый id.
				const changedById = h.changedBy
					? await resolveRef(ctx, "users", h.changedBy.toString())
					: undefined;
				statusHistory.push({
					status: h.status,
					changedAt: h.changedAt
						? new Date(h.changedAt).toISOString()
						: undefined,
					changedBy:
						changedById !== undefined
							? { relationTo: "users", value: changedById }
							: undefined,
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

			let deliveryMethod = old.delivery?.method;
			if (!deliveryMethod || !VALID_DELIVERY_METHODS.has(deliveryMethod)) {
				log.warn(
					`Заказ ${old.orderNumber} (${legacyId}): delivery.method="${deliveryMethod}" не входит в новый набор значений, подставлен "${FALLBACK_DELIVERY_METHOD}"`,
				);
				deliveryMethod = FALLBACK_DELIVERY_METHOD;
			}

			const paymentMethod =
				PAYMENT_METHOD_MAP[old.payment?.method] ?? "invoice";
			const cashNote = CASH_PAYMENT_NOTE[old.payment?.method];
			const internalNotes = cashNote
				? [old.internalNotes, cashNote].filter(Boolean).join("\n")
				: old.internalNotes;

			const attemptUpsert = () =>
				upsertByLegacyId({
					ctx,
					collection: "orders",
					legacyId,
					// orderNumber — в createOnlyData, а не в data, по двум причинам:
					//
					// 1. Номер заказа уникален, а обе системы нумеруют заказы
					//    одинаково (ORD-{год}-{6 цифр}) независимыми счётчиками. Пока
					//    старый сайт ещё принимает заказы, его новые номера
					//    сталкиваются с номерами, уже занятыми заказами нового сайта:
					//    create падал на unique-констрейнте, заказ уходил в failed и
					//    просто не переносился (воспроизведено). Ниже подбирается
					//    свободный номер.
					// 2. Заказы уже переносились раньше — со своими исходными
					//    номерами. Номер видит покупатель и называет его в поддержке,
					//    поэтому повторный прогон не имеет права его менять. В
					//    createOnlyData поле пишется только при создании и никогда не
					//    сравнивается/не обновляется (см. core/upsert.ts).
					createOnlyData: async () => {
						const orderNumber = await resolveFreeOrderNumber(
							ctx,
							old.orderNumber,
							legacyId,
						);
						if (orderNumber !== old.orderNumber) renumberedOrders++;
						return { orderNumber };
					},
					data: {
						// Дата оформления заказа в СТАРОЙ системе.
						//
						// Payload проставляет createdAt = now только если поле не
						// передали (см. @payloadcms/drizzle/dist/upsertRow: `if
						// (operation === 'create' && !data.createdAt)`), поэтому
						// историческую дату можно и нужно передать явно. Без этого все
						// перенесённые заказы получали дату миграции: в «Мои заказы»
						// (сортировка `-createdAt`) многолетняя история схлопывалась в
						// один день, и покупатели видели свои старые заказы как
						// «оформленные сегодня».
						//
						// Именно в data, а не в createOnlyData: поле должно
						// синхронизироваться и для УЖЕ перенесённых заказов — иначе
						// записи, созданные прошлыми прогонами, навсегда остались бы с
						// датой миграции. Это безопасно: дата оформления в старой БД
						// неизменна, а в новой системе её никто не редактирует.
						//
						// Условный spread обязателен: передать createdAt: undefined —
						// значит попросить Payload перезаписать дату пустым значением.
						// Если у легаси-заказа даты почему-то нет, поле просто не
						// трогаем.
						...(old.createdAt
							? { createdAt: new Date(old.createdAt).toISOString() }
							: {}),
						// updatedAt намеренно НЕ переносим: Payload перезаписывает его
						// на каждом update своим now (проверено), поэтому в data оно
						// давало бы вечный «чурн» — каждый прогон переписывал бы все
						// заказы ради поля, которое всё равно не сохранится. Для новой
						// системы updatedAt честно означает «когда мы последний раз
						// трогали эту строку».
						user: userId,
						status: old.status,
						recipient: {
							fullName: old.recipient?.fullName,
							phone: old.recipient?.phone,
							email: old.recipient?.email,
							contactPerson: old.recipient?.contactPerson,
						},
						delivery: {
							method: deliveryMethod,
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

			let result = await attemptUpsert();

			// Гонка с живым сайтом: resolveFreeOrderNumber проверил номер
			// свободным, но пока шла эта же миграция, реальный заказ с сайта
			// успел занять его — create() падает на unique-constraint по
			// orderNumber. Повторяем один раз: createOnlyData — функция, она
			// заново проверит свежее состояние БД и на этот раз корректно
			// увидит занятость номера (подберёт "-L" суффикс).
			if (
				result.action === "failed" &&
				extractUniqueConstraintFieldPaths(result.error).includes("orderNumber")
			) {
				result = await attemptUpsert();
			}

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

		if (ownerlessOrders > 0) {
			log.warn(
				`Заказов без владельца: ${ownerlessOrders}. Они перенесены (данные не потеряны), но не видны ни в одном личном кабинете. ` +
					"Обычно это заказы персонала старой системы (в admins переносится вручную) либо пользователей, чей перенос не удался — см. ERROR выше.",
			);
		}
		if (renumberedOrders > 0) {
			log.warn(
				`Заказов с изменённым номером: ${renumberedOrders}. Их исходные номера уже заняты заказами нового сайта, поэтому к номеру добавлен суффикс -L<legacyId> (исходный номер остаётся в начале строки и ищется поиском). Иначе эти заказы не перенеслись бы вовсе.`,
			);
		}

		return stats;
	},
});

/**
 * Подбирает номер, под которым легаси-заказ можно вставить в новую БД.
 *
 * Обе системы нумеруют заказы по одному шаблону ORD-{год}-{6 цифр} и каждая
 * от своего счётчика, поэтому пока старый сайт жив, номера неизбежно
 * сталкиваются. Уникальность orderNumber — констрейнт БД, так что вариантов
 * ровно два: не перенести заказ (тихая потеря оплаченных заказов — так было
 * раньше) или перенести под свободным номером. Второе очевидно лучше:
 * содержимое заказа ценнее, чем неизменность его номера.
 *
 * Суффикс детерминированный (берётся из legacyId, а не из счётчика/времени):
 * при повторном прогоне для того же заказа получится то же самое значение.
 * Исходный номер сохраняется в начале строки — заказ по-прежнему находится
 * поиском по номеру, который назовёт покупатель.
 *
 * Возвращает исходный номер, если он свободен (обычный случай).
 */
async function resolveFreeOrderNumber(
	ctx: MigrationContext,
	legacyOrderNumber: string,
	legacyId: string,
): Promise<string> {
	const { totalDocs } = await ctx.payload.find({
		collection: "orders",
		where: { orderNumber: { equals: legacyOrderNumber } },
		limit: 0,
		depth: 0,
		overrideAccess: true,
	});

	if (totalDocs === 0) return legacyOrderNumber;

	// legacyId (hex ObjectId) уникален, поэтому и суффикс уникален — повторной
	// коллизии быть не может.
	const fallback = `${legacyOrderNumber}-L${legacyId.slice(-6)}`;
	ctx.log.warn(
		`Номер ${legacyOrderNumber} уже занят заказом нового сайта — легаси-заказ ${legacyId} переносится как ${fallback}`,
	);
	return fallback;
}
