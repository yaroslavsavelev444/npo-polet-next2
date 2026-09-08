import type { FaqTopicView } from "../types";

/**
 * Разметка FAQPage (schema.org) для страницы вопросов.
 *
 * Зачем: с ней Google показывает вопросы и ответы прямо в выдаче. Требование
 * поисковика — ответ должен присутствовать в РАЗМЕТКЕ полностью и совпадать с
 * тем, что видит пользователь на странице. Поэтому сюда идёт plainAnswer
 * (полный текст ответа), а сами ответы на странице лежат в DOM всегда, даже у
 * свёрнутых пунктов, — свёрнутый аккордеон это разрешает, скрытый ответ,
 * подгружаемый по клику, — нет.
 *
 * Разметка ставится ТОЛЬКО на /faq. На главной FAQ неполон (несколько
 * выбранных вопросов), а две страницы с FAQPage-разметкой по одной теме
 * конкурируют друг с другом в выдаче.
 */
export function buildFaqPageSchema(topics: FaqTopicView[], pageUrl: string) {
	const mainEntity = topics.flatMap((topic) =>
		topic.questions.map((question) => ({
			"@type": "Question" as const,
			name: question.question,
			// Якорь ведёт на конкретный вопрос — в выдаче ссылка открывает
			// именно его, а не верх страницы.
			url: `${pageUrl}#${question.slug}`,
			acceptedAnswer: {
				"@type": "Answer" as const,
				text: question.plainAnswer,
			},
		})),
	);

	if (mainEntity.length === 0) return null;

	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity,
	};
}
