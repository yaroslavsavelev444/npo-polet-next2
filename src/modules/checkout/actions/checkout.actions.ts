"use server";

import { sql } from "@payloadcms/db-postgres";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PayloadRequest } from "payload";
import { toEcommerceProduct } from "@/modules/analytics/lib/ecommerce-product";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { normalizePromoCode } from "@/modules/promo/lib/promo-code";
import {
	clearCartItems,
	getCartByUserId,
} from "@/payload/services/carts.service";
import {
	readCheckoutAttempt,
	recordCheckoutAttempt,
	withCheckoutTransaction,
} from "@/payload/services/checkout-attempts.db";
import { saveCheckoutPreferences } from "@/payload/services/checkout-preferences.service";
import { isCompanyOwnedByUser } from "@/payload/services/companies.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { createOrderFromCheckout } from "@/payload/services/orders.service";
import { shiftProductPurchases } from "@/payload/services/product-counters.db";
import {
	loadPromoCodeLookup,
	type PromoCodeLookup,
} from "@/payload/services/promo-codes.service";
import {
	attachRedemptionToOrder,
	reserveRedemption,
} from "@/payload/services/promo-redemptions.db";
import type { TransactionDatabase } from "@/payload/services/transaction.db";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyNewOrder } from "@/services/notifications/notifyNewOrder";
import {
	getCheckoutCartKey,
	isCheckoutAttemptId,
} from "../lib/checkout-attempt";
import { calculateCheckoutPricing } from "../lib/checkout-pricing";
import { checkoutSchema, collectFieldErrors } from "../lib/checkout-schema";
import type {
	CheckoutActionResult,
	CheckoutAttemptResult,
	CheckoutReceipt,
	CheckoutSubmitInput,
} from "../types";

export async function resolveCheckoutAttemptAction(
	attemptId: string,
	expectedUserId: string,
): Promise<CheckoutAttemptResult> {
	const user = await getCurrentUser();
	if (!user || String(user.id) !== expectedUserId)
		return { state: "auth_required" };
	if (!isCheckoutAttemptId(attemptId)) return { state: "invalid" };

	const payload = await getPayloadInstance();
	await withCheckoutTransaction(payload, user.id, async (db) => {
		const attempt = await readCheckoutAttempt(db, user.id, attemptId);
		if (attempt) return;

		// Если первоначальный запрос ещё не дошёл до транзакции, он увидит
		// закрытую попытку и уже не сможет создать заказ после ответа «не оформлен».
		await recordCheckoutAttempt(db, user.id, attemptId);
	});

	// Адаптер может завершить неудачный коммит откатом без исключения.
	const committed = await readCheckoutAttempt(
		payload.db.drizzle,
		user.id,
		attemptId,
	);
	if (!committed) throw new Error("Checkout attempt missing after commit");
	if (committed.state === "created") revalidateCheckout();
	return committed;
}

function revalidateCheckout() {
	revalidatePath("/cart");
	revalidatePath("/orders");
}

export async function submitOrderAction(
	input: CheckoutSubmitInput,
	attempt: { id: string; userId: string; cartKey: string },
): Promise<CheckoutActionResult> {
	const user = await getCurrentUser();
	if (!user || String(user.id) !== attempt?.userId)
		return {
			success: false,
			error: "AUTH_REQUIRED",
			message: "Войдите в аккаунт, чтобы оформить заказ",
		};

	if (!isCheckoutAttemptId(attempt.id)) {
		return {
			success: false,
			error: "VALIDATION_ERROR",
			message: "Обновите страницу и подтвердите заказ ещё раз",
		};
	}

	const payload = await getPayloadInstance();
	const meta = await getRequestMeta();
	const { result, order } = await withCheckoutTransaction(
		payload,
		user.id,
		async (db, req): Promise<PlacementOutcome> => {
			const existing = await readCheckoutAttempt(db, user.id, attempt.id);
			if (existing?.state === "created") {
				return { result: { success: true, data: existing.receipt } as const };
			}
			if (existing) {
				return {
					result:
						existing.state === "removed"
							? ({
									success: false,
									error: "ORDER_REMOVED",
									message: absentOrderMessage(existing.orderNumber),
								} as const)
							: ({
									success: false,
									error: "ATTEMPT_CLOSED",
									message:
										"Заказ не оформлен. Проверьте данные и подтвердите его снова.",
								} as const),
				};
			}

			const outcome = await placeOrder(
				input,
				attempt.cartKey,
				user.id,
				meta,
				payload,
				db,
				req,
			);
			await recordCheckoutAttempt(
				db,
				user.id,
				attempt.id,
				outcome.result.success && outcome.order
					? { id: outcome.order.id, receipt: outcome.result.data }
					: undefined,
			);
			return outcome;
		},
	);

	// Адаптер может завершить неудачный коммит откатом без исключения.
	const committed = await readCheckoutAttempt(
		payload.db.drizzle,
		user.id,
		attempt.id,
	);
	if (!committed || (result.success && committed.state !== "created")) {
		throw new Error("Checkout attempt result missing after commit");
	}

	if (result.success) {
		if (order) {
			after(async () => {
				const effects = await Promise.allSettled([
					notifyNewOrder(order, payload),
					notify(payload, user.id, "order_created", {
						orderNumber: order.orderNumber,
						itemsCount: order.items?.length ?? 0,
					}),
					shiftProductPurchases(
						payload,
						(order.items ?? []).map(({ product }) =>
							typeof product === "number" ? product : product?.id,
						),
						1,
					),
				]);
				for (const effect of effects) {
					if (effect.status === "rejected") {
						payload.logger.error(
							{ err: effect.reason, orderId: order.id },
							"[checkout] post-commit effect failed",
						);
					}
				}
			});
		}
		revalidateCheckout();
	}
	return result;
}

type PlacementOutcome =
	| { result: Extract<CheckoutActionResult, { success: false }>; order?: never }
	| {
			result: Extract<CheckoutActionResult, { success: true }>;
			order?: Awaited<ReturnType<typeof createOrderFromCheckout>>;
	  };

async function placeOrder(
	input: CheckoutSubmitInput,
	cartKey: string,
	userId: number,
	meta: Awaited<ReturnType<typeof getRequestMeta>>,
	payload: Awaited<ReturnType<typeof getPayloadInstance>>,
	db: TransactionDatabase,
	req: Partial<PayloadRequest>,
): Promise<PlacementOutcome> {
	const parsed = checkoutSchema.safeParse(input);
	if (!parsed.success) {
		// Та же схема выполняется на клиенте, поэтому сюда попадают только
		// расхождения с клиентом (устаревшая вкладка, обход формы) — но список
		// ошибок всё равно возвращается полным и по тем же путям, что понимает
		// форма: она покажет их у полей и в общей сводке.
		const fieldErrors = collectFieldErrors(parsed.error.issues);
		return {
			result: {
				success: false,
				error: "VALIDATION_ERROR",
				message:
					parsed.error.issues[0]?.message ?? "Проверьте введённые данные",
				fieldErrors,
			},
		};
	}

	// Пока пишется заказ, параллельная запись в эту строку корзины ждёт коммита.
	await db.execute(
		sql`SELECT id FROM carts WHERE user_id = ${userId} FOR UPDATE`,
	);
	const cartDoc = await getCartByUserId(String(userId), req);
	const cartView = await buildCartView(cartDoc, req);

	if (!cartDoc || cartView.items.length === 0) {
		return {
			result: { success: false, error: "CART_EMPTY", message: "Корзина пуста" },
		};
	}

	// ── Недоступные позиции ────────────────────────────────────────────────
	//
	// Корзина пересобирается здесь заново из базы, поэтому в `unavailable`
	// попадает АКТУАЛЬНОЕ состояние — в том числе товар, снятый с продажи в
	// последнюю секунду перед отправкой формы. В расчёт такие позиции не
	// входят никогда (см. buildCartView), то есть в заказ они не попали бы и
	// без этой проверки.
	//
	// Но молча оформить заказ на оставшееся нельзя: покупатель подтверждал
	// один состав, а получил бы другой — с другой суммой, другой скидкой
	// корзины и, возможно, без промокода, порог которого уже не набирается.
	// Поэтому отправка останавливается, и решение остаётся за ним.
	if (cartView.unavailable.length > 0) {
		const names = cartView.unavailable
			.map((entry) => entry.title)
			.filter(Boolean)
			.join(", ");
		return {
			result: {
				success: false,
				error: "CART_HAS_UNAVAILABLE",
				message: names
					? `Эти товары больше недоступны для заказа: ${names}. Уберите их из корзины, чтобы продолжить.`
					: "В корзине есть товары, недоступные для заказа. Уберите их, чтобы продолжить.",
			},
		};
	}

	if (!cartView.validation.isValid) {
		return {
			result: {
				success: false,
				error: "CART_INVALID",
				message:
					cartView.validation.issues[0]?.message ??
					"Проверьте количество товаров в корзине",
			},
		};
	}

	if (getCheckoutCartKey(cartView) !== cartKey) {
		return {
			result: {
				success: false,
				error: "CART_CHANGED",
				message: "Корзина изменилась. Проверьте товары и сумму заказа.",
			},
		};
	}

	const form = parsed.data;

	// ── Company: create if new + save requested ────────────────────────────
	let companyForm = form.company;

	// existingCompanyId приходит из формы, то есть полностью управляется
	// клиентом. Без проверки владельца заказ можно было привязать к организации
	// ЧУЖОГО пользователя (её реквизиты — ИНН, юр. адрес — подтягиваются по
	// связи при чтении заказа), просто подставив другой id. Схема при этом не
	// требует остальных полей компании, когда указан existingCompanyId, —
	// проверка принадлежности здесь единственная.
	if (companyForm?.isCompany && companyForm.existingCompanyId) {
		const owned = await isCompanyOwnedByUser(
			companyForm.existingCompanyId,
			String(userId),
			req,
		);
		if (!owned) {
			return {
				result: {
					success: false,
					error: "VALIDATION_ERROR",
					message: "Организация не найдена",
					fieldErrors: {
						"company.existingCompanyId": "Организация не найдена",
					},
				},
			};
		}
	}

	// ── Промокод: перепроверка на сервере ──────────────────────────────────
	//
	// Клиент присылает только КОД. Сумма скидки считается здесь заново из
	// корзины и правил кода — ровно тем же вызовом, что и на предпросмотре
	// («Применить»), см. calculateCheckoutPricing. Поэтому подделать размер
	// скидки, подменив тело запроса, невозможно в принципе: присланного числа
	// просто нет.
	//
	// Перепроверять обязательно и потому, что между «Применить» и
	// «Подтвердить заказ» проходит время: код мог истечь, исчерпать лимит или
	// быть выключен администратором. Отказ здесь — не ошибка формы, а
	// изменившееся условие, и покупателю о нём говорится прямо.
	const promoCode = normalizePromoCode(form.promoCode ?? "");
	let promoLookup: PromoCodeLookup | null = null;

	if (promoCode !== "") {
		promoLookup = await loadPromoCodeLookup(promoCode, String(userId), req);
		if (!promoLookup) {
			return {
				result: promoError("Промокод не найден или больше не действует"),
			};
		}
	}

	const pricing = calculateCheckoutPricing(cartView, promoLookup);
	const appliedPromo =
		pricing.promo && pricing.promo.applied ? pricing.promo : null;

	if (promoLookup && !appliedPromo) {
		return {
			result: promoError(
				pricing.promo && !pricing.promo.applied
					? pricing.promo.message
					: "Промокод больше не применим к этому заказу",
			),
		};
	}

	// ── Активация промокода ────────────────────────────────────────────────
	//
	// Списывается ДО создания заказа. Обратный порядок («создать заказ, затем
	// списать») означал бы заказ со скидкой, на которую покупатель уже не имел
	// права: лимит мог кончиться за те миллисекунды, что шла запись заказа.
	// Само списание атомарно (см. reserveRedemption), поэтому
	// одновременные заказы по последней активации получит ровно один.
	let redemptionId: string | null = null;

	if (appliedPromo) {
		redemptionId = await reserveRedemption(db, {
			promoCodeId: appliedPromo.promoCodeId,
			code: appliedPromo.code,
			userId: String(userId),
			discountAmount: appliedPromo.discountAmount,
		});

		if (!redemptionId) {
			return { result: promoError("Промокод исчерпал лимит использований") };
		}
	}

	if (
		companyForm?.isCompany &&
		!companyForm.existingCompanyId &&
		companyForm.saveCompany
	) {
		const created = await payload.create({
			collection: "companies",
			data: {
				user: userId,
				companyName: companyForm.companyName!,
				legalAddress: companyForm.legalAddress!,
				companyAddress: companyForm.companyAddress,
				taxNumber: companyForm.taxNumber!,
				kpp: companyForm.kpp || undefined,
				ogrn: companyForm.ogrn || undefined,
				contactPerson: companyForm.contactPerson,
			},
			overrideAccess: true,
			req,
		});
		companyForm = { ...companyForm, existingCompanyId: String(created.id) };
	}

	const order = await createOrderFromCheckout({
		userId: String(userId),
		cart: cartView,
		form: { ...form, company: companyForm },
		meta,
		pricing,
		promo: appliedPromo,
		req,
	});

	if (redemptionId) {
		await attachRedemptionToOrder(db, redemptionId, String(order.id));
	}

	// ── Persist "save for next time" preferences ────────────────────────────
	await saveCheckoutPreferences(
		String(userId),
		{
			recipient: form.recipient.saveRecipient
				? {
						fullName: form.recipient.fullName,
						// Свой номер сохраняется отдельно от номера получателя: в
						// профиле телефона нет, и без этого пользователь набирал бы его
						// заново при каждом заказе.
						customerPhone: form.customer.phone,
						phone: form.recipient.phone,
						email: form.recipient.email,
					}
				: undefined,
			delivery: form.delivery.saveAddress
				? {
						method: form.delivery.method,
						address: form.delivery.address,
						transportCompanyId: form.delivery.transportCompanyId,
						pickupPointId: form.delivery.pickupPointId,
					}
				: undefined,
		},
		req,
	);

	await clearCartItems(String(userId), { cartId: cartDoc.id, req });

	const receipt: CheckoutReceipt = {
		orderNumber: order.orderNumber,
		purchase: {
			id: order.orderNumber,
			revenue: pricing.total,
			coupon: appliedPromo?.code,
			products: cartView.items.map((item) => ({
				...toEcommerceProduct(item.product, item.quantity),
				price: item.unitFinalPrice,
			})),
		},
	};
	return { result: { success: true, data: receipt }, order };
}

function absentOrderMessage(orderNumber: string) {
	return `Заказ №${orderNumber} был оформлен, но его карточка больше недоступна.`;
}

/**
 * Отказ по промокоду.
 *
 * Ошибка привязана к полю `promoCode`, чтобы форма подсветила именно его, а
 * не показала безадресное «проверьте данные»: исправляется такой отказ
 * снятием кода, и вести покупателя нужно туда.
 */
function promoError(
	message: string,
): Extract<CheckoutActionResult, { success: false }> {
	return {
		success: false,
		error: "PROMO_INVALID",
		message,
		fieldErrors: { promoCode: message },
	};
}
