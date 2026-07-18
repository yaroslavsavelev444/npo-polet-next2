import { z } from "zod";

/**
 * Границы отзыва. Единый источник правды для формы (счётчик символов,
 * валидация) и серверного экшена. Совпадают с ограничениями коллекции
 * product-reviews (rating 1..5, comment required).
 */
export const REVIEW_LIMITS = {
	comment: { min: 10, max: 2000 },
	rating: { min: 1, max: 5 },
} as const;

export const reviewFormSchema = z.object({
	rating: z
		.number({ error: "Поставьте оценку" })
		.int()
		.min(REVIEW_LIMITS.rating.min, "Поставьте оценку")
		.max(REVIEW_LIMITS.rating.max),
	comment: z
		.string()
		.trim()
		.min(
			REVIEW_LIMITS.comment.min,
			`Минимум ${REVIEW_LIMITS.comment.min} символов`,
		)
		.max(
			REVIEW_LIMITS.comment.max,
			`Максимум ${REVIEW_LIMITS.comment.max} символов`,
		),
});

export type ReviewFormData = z.infer<typeof reviewFormSchema>;
