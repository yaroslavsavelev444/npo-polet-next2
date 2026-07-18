"use server";

import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { getPayloadInstance } from "@/payload/services/getPayload";
import {
	getUserReviewForProduct,
	hasUserPurchasedProduct,
} from "@/payload/services/reviews.service";
import { reviewFormSchema } from "../schemas/review.schema";
import type { ReviewActionResult } from "../types";

/**
 * Создание отзыва о товаре.
 *
 * Все проверки права дублируются на сервере — клиенту не доверяем:
 *  1. пользователь авторизован;
 *  2. купил товар в завершённом (delivered) заказе;
 *  3. ещё не оставлял отзыв на этот товар.
 * Отзыв создаётся со статусом `pending` и появляется публично только после
 * модерации (см. Reviews.ts). `isVerifiedPurchase` = true, т.к. право на
 * отзыв даёт только подтверждённая покупка.
 */
export async function submitReviewAction(
	productId: string,
	input: unknown,
): Promise<ReviewActionResult> {
	const parsed = reviewFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			error: "Проверьте оценку и текст отзыва",
			code: "validation",
		};
	}

	const user = await getCurrentUser();
	if (!user) {
		return {
			success: false,
			error: "Войдите в аккаунт, чтобы оставить отзыв",
			code: "not_authenticated",
		};
	}

	const { ip } = await getRequestMeta();
	const rl = await RATE_LIMITS.review(ip);
	if (!rl.allowed) {
		return {
			success: false,
			error: "Слишком много попыток. Попробуйте позже.",
			code: "rate_limited",
		};
	}

	// Повторная проверка: один отзыв на товар.
	const existing = await getUserReviewForProduct(user.id, productId);
	if (existing) {
		return {
			success: false,
			error: "Вы уже оставили отзыв на этот товар",
			code: "already_reviewed",
		};
	}

	// Право на отзыв даёт только завершённый заказ с этим товаром.
	const purchased = await hasUserPurchasedProduct(user.id, productId);
	if (!purchased) {
		return {
			success: false,
			error: "Отзыв можно оставить только после покупки товара",
			code: "not_purchased",
		};
	}

	try {
		const payload = await getPayloadInstance();
		await payload.create({
			collection: "product-reviews",
			data: {
				user: Number(user.id),
				product: Number(productId),
				rating: parsed.data.rating,
				comment: parsed.data.comment,
				status: "pending",
				isVerifiedPurchase: true,
			},
			overrideAccess: true,
		});
	} catch (error) {
		// beforeValidate-хук коллекции тоже бросает при дубле — на случай гонки.
		const message = error instanceof Error ? error.message : "";
		if (message.includes("уже существует")) {
			return {
				success: false,
				error: "Вы уже оставили отзыв на этот товар",
				code: "already_reviewed",
			};
		}
		console.error("[reviews] create failed", error);
		return {
			success: false,
			error: "Не удалось отправить отзыв. Попробуйте позже.",
			code: "server_error",
		};
	}

	return { success: true };
}
