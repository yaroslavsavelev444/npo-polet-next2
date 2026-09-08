import { slugify } from "transliteration";
import type { Faq } from "@/payload-types";
import type { FaqQuestionView, FaqTopicView } from "../types";
import { extractPlainText } from "./extractPlainText";

/**
 * Payload-документы FAQ → вью-модель витрины.
 *
 * Здесь и только здесь применяются правила видимости и порядка. Компоненты
 * получают готовый список и ничего не фильтруют: иначе «показывать только
 * активные» пришлось бы помнить в каждом месте, где выводится FAQ, — на
 * главной, на странице /faq и в разметке для поиска.
 *
 * Пустые темы (все вопросы скрыты) отбрасываются: заголовок раздела без
 * единого вопроса под ним выглядит как сломанная вёрстка.
 */

const byOrder = (a: { order?: number | null }, b: { order?: number | null }) =>
	(a.order ?? 0) - (b.order ?? 0);

/**
 * Якорь берётся из поля, а если его нет (документ создан до появления поля) —
 * считается на лету из текста. Запасной вариант с id гарантирует, что якорь
 * есть всегда: без него ссылка на вопрос вела бы в никуда.
 */
function resolveSlug(
	explicit: string | null | undefined,
	source: string,
	fallback: string,
): string {
	if (explicit?.trim()) return explicit.trim();
	const generated = slugify(source, { lowercase: true });
	return generated || fallback;
}

export function mapFaqTopics(topics: Faq[]): FaqTopicView[] {
	return topics
		.filter((topic) => topic.isActive !== false)
		.slice()
		.sort(byOrder)
		.map((topic) => {
			const questions: FaqQuestionView[] = (topic.questions ?? [])
				.filter((item) => item.isActive !== false && Boolean(item.answer))
				.slice()
				.sort(byOrder)
				.map((item, index) => ({
					id: String(item.id ?? `${topic.id}-${index}`),
					slug: resolveSlug(
						item.slug,
						item.question,
						`vopros-${topic.id}-${index}`,
					),
					question: item.question,
					answer: item.answer,
					plainAnswer: extractPlainText(item.answer),
					isFeatured: Boolean(item.isFeatured),
				}));

			return {
				id: String(topic.id),
				slug: resolveSlug(topic.slug, topic.title, `tema-${topic.id}`),
				title: topic.title,
				description: topic.description?.trim() || null,
				questions,
			};
		})
		.filter((topic) => topic.questions.length > 0);
}

/**
 * Вопросы для главной: только отмеченные «показывать на главной», в порядке
 * тем и вопросов внутри них.
 *
 * Если не отмечен ни один — берутся первые по порядку. Это осознанная
 * подстраховка: пустой блок FAQ на главной выглядит как поломка, а
 * администратор, который только что завёл вопросы, ещё не знает про галочку.
 */
export function selectFeaturedQuestions(
	topics: FaqTopicView[],
	limit: number,
): FaqQuestionView[] {
	const all = topics.flatMap((topic) => topic.questions);
	const featured = all.filter((question) => question.isFeatured);
	return (featured.length > 0 ? featured : all).slice(0, limit);
}
