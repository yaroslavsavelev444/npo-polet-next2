"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { normalizePromoCode } from "@/modules/promo/lib/promo-code";
import {
	clearCartItems,
	getCartByUserId,
} from "@/payload/services/carts.service";
import { saveCheckoutPreferences } from "@/payload/services/checkout-preferences.service";
import { isCompanyOwnedByUser } from "@/payload/services/companies.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { createOrderFromCheckout } from "@/payload/services/orders.service";
import type { PromoCodeLookup } from "@/payload/services/promo-codes.service";
import {
	attachRedemptionToOrder,
	loadPromoCodeLookup,
	reservePromoCodeRedemption,
	revokePromoCodeRedemptionById,
} from "@/payload/services/promo-codes.service";
import { calculateCheckoutPricing } from "../lib/checkout-pricing";
import { checkoutSchema, collectFieldErrors } from "../lib/checkout-schema";
import type { CheckoutActionResult, CheckoutSubmitInput } from "../types";

export async function submitOrderAction(
	input: CheckoutSubmitInput,
): Promise<CheckoutActionResult> {
	const user = await getCurrentUser();
	if (!user)
		return {
			success: false,
			error: "AUTH_REQUIRED",
			message: "Войдите в аккаунт, чтобы оформить заказ",
		};

	const parsed = checkoutSchema.safeParse(input);
	if (!parsed.success) {
		// Та же схема выполняется на клиенте, поэтому сюда попадают только
		// расхождения с клиентом (устаревшая вкладка, обход формы) — но список
		// ошибок всё равно возвращается полным и по тем же путям, что понимает
		// форма: она покажет их у полей и в общей сводке.
		const fieldErrors = collectFieldErrors(parsed.error.issues);
		return {
			success: false,
			error: "VALIDATION_ERROR",
			message: parsed.error.issues[0]?.message ?? "Проверьте введённые данные",
			fieldErrors,
		};
	}

	const cartDoc = await getCartByUserId(String(user.id));
	const cartView = await buildCartView(cartDoc);

	if (cartView.items.length === 0) {
		return { success: false, error: "CART_EMPTY", message: "Корзина пуста" };
	}
	if (!cartView.validation.isValid) {
		return {
			success: false,
			error: "CART_INVALID",
			message:
				cartView.validation.issues[0]?.message ??
				"Проверьте количество товаров в корзине",
		};
	}

	const { ip, userAgent } = await getRequestMeta();
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
			String(user.id),
		);
		if (!owned) {
			return {
				success: false,
				error: "VALIDATION_ERROR",
				message: "Организация не найдена",
				fieldErrors: {
					"company.existingCompanyId": "Организация не найдена",
				},
			};
		}
	}

	if (
		companyForm?.isCompany &&
		!companyForm.existingCompanyId &&
		companyForm.saveCompany
	) {
		const payload = await getPayloadInstance();
		const created = await payload.create({
			collection: "companies",
			data: {
				user: user.id,
				companyName: companyForm.companyName!,
				legalAddress: companyForm.legalAddress!,
				companyAddress: companyForm.companyAddress,
				taxNumber: companyForm.taxNumber!,
				contactPerson: companyForm.contactPerson,
			},
			overrideAccess: true,
		});
		companyForm = { ...companyForm, existingCompanyId: String(created.id) };
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
		promoLookup = await loadPromoCodeLookup(promoCode, String(user.id));
		if (!promoLookup) {
			return promoError("Промокод не найден или больше не действует");
		}
	}

	const pricing = calculateCheckoutPricing(cartView, promoLookup);
	const appliedPromo =
		pricing.promo && pricing.promo.applied ? pricing.promo : null;

	if (promoLookup && !appliedPromo) {
		return promoError(
			pricing.promo && !pricing.promo.applied
				? pricing.promo.message
				: "Промокод больше не применим к этому заказу",
		);
	}

	// ── Активация промокода ────────────────────────────────────────────────
	//
	// Списывается ДО создания заказа. Обратный порядок («создать заказ, затем
	// списать») означал бы заказ со скидкой, на которую покупатель уже не имел
	// права: лимит мог кончиться за те миллисекунды, что шла запись заказа.
	// Само списание атомарно (см. reservePromoCodeRedemption), поэтому
	// одновременные заказы по последней активации получит ровно один.
	let redemptionId: string | null = null;

	if (appliedPromo) {
		redemptionId = await reservePromoCodeRedemption({
			promoCodeId: appliedPromo.promoCodeId,
			code: appliedPromo.code,
			userId: String(user.id),
			discountAmount: appliedPromo.discountAmount,
		});

		if (!redemptionId) {
			return promoError("Промокод исчерпал лимит использований");
		}
	}

	let order: Awaited<ReturnType<typeof createOrderFromCheckout>>;
	try {
		order = await createOrderFromCheckout({
			userId: String(user.id),
			cart: cartView,
			form: { ...form, company: companyForm },
			meta: { ip, userAgent },
			pricing,
			promo: appliedPromo,
		});
	} catch (error) {
		// Заказ не создан — активацию нужно вернуть, иначе сбой базы навсегда
		// «съел» бы одну активацию промокода, не дав покупателю ничего.
		if (redemptionId) {
			await revokePromoCodeRedemptionById(
				redemptionId,
				"Заказ не был создан",
			).catch((err) =>
				console.error("[checkout] promo revoke after failure:", err),
			);
		}
		throw error;
	}

	if (redemptionId) {
		// Связь с заказом проставляется отдельным шагом: до создания заказа его
		// id ещё не существует. Сбой здесь не отменяет заказ — активация
		// останется списанной, но без ссылки, и это честнее, чем откатывать уже
		// оформленный заказ.
		await attachRedemptionToOrder(redemptionId, String(order.id)).catch((err) =>
			console.error("[checkout] promo attach to order:", err),
		);
	}

	// ── Persist "save for next time" preferences ────────────────────────────
	await saveCheckoutPreferences(String(user.id), {
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
	});

	await clearCartItems(String(user.id));
	revalidatePath("/cart");
	revalidatePath("/checkout");
	revalidatePath("/orders");

	return { success: true, data: { orderNumber: order.orderNumber as string } };
}

/**
 * Отказ по промокоду.
 *
 * Ошибка привязана к полю `promoCode`, чтобы форма подсветила именно его, а
 * не показала безадресное «проверьте данные»: исправляется такой отказ
 * снятием кода, и вести покупателя нужно туда.
 */
function promoError(message: string): CheckoutActionResult {
	return {
		success: false,
		error: "PROMO_INVALID",
		message,
		fieldErrors: { promoCode: message },
	};
}
