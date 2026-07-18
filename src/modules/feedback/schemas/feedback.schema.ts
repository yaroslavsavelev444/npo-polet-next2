import { z } from "zod";

/**
 * Категории обратной связи. Значения синхронизированы с select `type`
 * в коллекции Feedbacks (payload/collections/Feedbacks.ts) — при изменении
 * править в обоих местах.
 */
export const FEEDBACK_TYPES = [
	"bug",
	"improvement",
	"question",
	"order_issue",
	"account_issue",
	"other",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

// Границы длин. Держим здесь единым источником правды: те же значения
// проставлены в minLength/maxLength полей коллекции, а фронт показывает по ним
// счётчики символов.
export const FEEDBACK_LIMITS = {
	title: { min: 5, max: 120 },
	description: { min: 20, max: 4000 },
} as const;

export const feedbackFormSchema = z.object({
	type: z.enum(FEEDBACK_TYPES, { error: "Выберите тип обращения" }),
	title: z
		.string()
		.trim()
		.min(
			FEEDBACK_LIMITS.title.min,
			`Минимум ${FEEDBACK_LIMITS.title.min} символов`,
		)
		.max(
			FEEDBACK_LIMITS.title.max,
			`Максимум ${FEEDBACK_LIMITS.title.max} символов`,
		),
	description: z
		.string()
		.trim()
		.min(
			FEEDBACK_LIMITS.description.min,
			`Минимум ${FEEDBACK_LIMITS.description.min} символов`,
		)
		.max(
			FEEDBACK_LIMITS.description.max,
			`Максимум ${FEEDBACK_LIMITS.description.max} символов`,
		),
	// Email обязателен для всех (и гостей, и авторизованных). У авторизованных
	// подставляется автоматически, но остаётся редактируемым.
	email: z
		.string()
		.trim()
		.min(1, "Укажите email для связи")
		.email("Некорректный email"),
});

export type FeedbackFormData = z.infer<typeof feedbackFormSchema>;
