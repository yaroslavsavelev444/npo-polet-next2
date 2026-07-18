// services/feedbacks.service.ts
import type { Feedback } from "../../../payload-types";
import type { FeedbackType } from "../../modules/feedback/schemas/feedback.schema";
import { getPayloadInstance } from "./getPayload";

export interface CreateFeedbackInput {
	type: FeedbackType;
	title: string;
	description: string;
	userEmail: string;
	userAgent?: string;
}

/**
 * Создаёт обращение обратной связи.
 *
 * `overrideAccess: true` — намеренно: create в коллекции закрыт (() => false),
 * единственный легитимный путь создания проходит через server action
 * submitFeedbackAction, который уже выполнил rate-limit и валидацию. Так
 * прямой POST на /api/feedbacks невозможен, а форму может отправить и гость.
 */
export async function createFeedback(
	input: CreateFeedbackInput,
): Promise<Feedback> {
	const payload = await getPayloadInstance();

	const feedback = await payload.create({
		collection: "feedbacks",
		overrideAccess: true,
		data: {
			type: input.type,
			title: input.title,
			description: input.description,
			userEmail: input.userEmail,
			userAgent: input.userAgent,
			status: "new",
		},
	});

	return feedback as unknown as Feedback;
}
