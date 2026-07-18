"use server";

import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { createFeedback } from "@/payload/services/feedbacks.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyNewFeedback } from "@/services/notifications/notifyNewFeedback";
import { feedbackFormSchema } from "../schemas/feedback.schema";

export type FeedbackActionResult =
	| { success: true }
	| {
			success: false;
			error: string;
			code?: "validation" | "rate_limited" | "server_error";
	  };

/**
 * Приём обращения обратной связи.
 *
 * Единственная точка создания feedback. Валидация и rate-limit выполняются на
 * сервере (клиентской валидации не доверяем); User-Agent берётся из заголовков
 * запроса, а не из тела — подделать нельзя. После создания весь персонал
 * уведомляется письмом.
 */
export async function submitFeedbackAction(
	input: unknown,
): Promise<FeedbackActionResult> {
	// 1. Серверная валидация (не доверяем клиенту).
	const parsed = feedbackFormSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			error: "Проверьте правильность заполнения полей",
			code: "validation",
		};
	}

	const { ip, userAgent } = await getRequestMeta();

	// 2. Rate limit: не больше 5 обращений с одного IP за 15 минут.
	const rl = await RATE_LIMITS.feedback(ip);
	if (!rl.allowed) {
		return {
			success: false,
			error: "Слишком много обращений. Попробуйте позже.",
			code: "rate_limited",
		};
	}

	const { type, title, description, email } = parsed.data;

	// 3. Создание записи (overrideAccess внутри сервиса — create в коллекции закрыт).
	let feedbackId: number | string;
	try {
		const feedback = await createFeedback({
			type,
			title,
			description,
			userEmail: email,
			userAgent,
		});
		feedbackId = feedback.id;
	} catch (error) {
		console.error("[feedback] create failed", error);
		return {
			success: false,
			error: "Не удалось отправить обращение. Попробуйте позже.",
			code: "server_error",
		};
	}

	// 4. Уведомляем персонал. notifyNewFeedback не бросает — сбой почты не
	// должен превращаться в ошибку для пользователя (обращение уже сохранено).
	const payload = await getPayloadInstance();
	await notifyNewFeedback(
		{ id: feedbackId, type, title, description, userEmail: email },
		payload,
	);

	return { success: true };
}
