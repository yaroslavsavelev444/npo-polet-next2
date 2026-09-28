"use server";

import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import { getPayloadInstance } from "@/payload/services/getPayload";
import {
	deleteRestockSubscription,
	insertRestockSubscription,
	listSubscribedProductIds,
} from "@/payload/services/restock-subscriptions.db";
import { getProductUnavailableReason } from "@/payload/utils/product-availability";
import type { Product } from "@/payload-types";
import { captureError } from "@/services/observability/capture";

export type RestockActionErrorCode =
	| "AUTH_REQUIRED"
	| "NOT_FOUND"
	/** Товар можно купить уже сейчас — ждать нечего. */
	| "AVAILABLE"
	/** Снят с производства: сообщать не о чем, предлагается заявка. */
	| "NOT_ELIGIBLE"
	| "RATE_LIMITED"
	| "UNKNOWN";

export type RestockActionResult =
	| { success: true; data: { subscribed: boolean } }
	| { success: false; error: RestockActionErrorCode; message: string };

export interface RestockSubscriptionsState {
	authenticated: boolean;
	productIds: string[];
}

/** Переключений в минуту на пользователя: с запасом для живого человека. */
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function failure(
	error: RestockActionErrorCode,
	message: string,
): RestockActionResult {
	return { success: false, error, message };
}

/**
 * Товары, поступления которых ждёт текущий пользователь. Вызывается один раз
 * за сеанс страницы — и только если на ней есть недоступный товар (см.
 * restock.store): остальным страницам эти данные не нужны.
 */
export async function getRestockSubscriptionsAction(): Promise<RestockSubscriptionsState> {
	const user = await getCurrentUser();
	if (!user) return { authenticated: false, productIds: [] };

	const payload = await getPayloadInstance();
	const ids = await listSubscribedProductIds(payload, Number(user.id));
	return { authenticated: true, productIds: ids.map(String) };
}

/**
 * «Сообщить о поступлении» / «Не сообщать».
 *
 * Явное желаемое состояние, а не toggle: двойной клик или повтор после
 * сетевой ошибки должны приводить к одному и тому же результату, а не
 * отменять друг друга. Подписка идемпотентна и в базе (ON CONFLICT).
 *
 * Подписаться можно только на товар, которого НЕТ В НАЛИЧИИ. Для доступного
 * ждать нечего, а «снят с производства» не вернётся — обещать о нём
 * уведомление значило бы обманывать; там интерфейс предлагает заявку.
 * Отписаться можно всегда: товар мог сменить статус, пока страница открыта.
 */
export async function setRestockSubscriptionAction(
	productId: string,
	subscribe: boolean,
): Promise<RestockActionResult> {
	const user = await getCurrentUser();
	if (!user) {
		return failure(
			"AUTH_REQUIRED",
			"Войдите в аккаунт — уведомление придёт в колокольчик на сайте",
		);
	}

	const numericId = Number(productId);
	if (!Number.isInteger(numericId) || numericId <= 0) {
		return failure("NOT_FOUND", "Товар не найден");
	}

	const limit = await checkRateLimit(
		`restock_subscription:${user.id}`,
		RATE_LIMIT,
		RATE_LIMIT_WINDOW_MS,
	);
	if (!limit.allowed) {
		return failure(
			"RATE_LIMITED",
			"Слишком много действий. Попробуйте через минуту.",
		);
	}

	try {
		const payload = await getPayloadInstance();

		if (!subscribe) {
			await deleteRestockSubscription(payload, Number(user.id), numericId);
			return { success: true, data: { subscribed: false } };
		}

		let product: Product;
		try {
			product = (await payload.findByID({
				collection: "products",
				id: numericId,
				depth: 0,
			})) as Product;
		} catch {
			return failure("NOT_FOUND", "Товар не найден");
		}

		const reason = getProductUnavailableReason(product);
		if (reason === null) {
			return failure(
				"AVAILABLE",
				"Товар уже в продаже — его можно добавить в корзину",
			);
		}
		// Черновик или скрытый товар на витрине не показывается — подписка на
		// него возможна только подделанным запросом.
		if (reason !== "status") return failure("NOT_FOUND", "Товар не найден");
		if (product.inventory?.status !== "out_of_stock") {
			return failure(
				"NOT_ELIGIBLE",
				"Товар снят с производства — оставьте заявку, и менеджер предложит варианты",
			);
		}

		await insertRestockSubscription(payload, Number(user.id), numericId);
		return { success: true, data: { subscribed: true } };
	} catch (error) {
		const errorId = captureError(error, {
			source: "action",
			module: "restock/subscribe",
		});
		console.error("[restock] subscription failed", error, { errorId });
		return failure("UNKNOWN", "Не удалось сохранить. Попробуйте ещё раз.");
	}
}
