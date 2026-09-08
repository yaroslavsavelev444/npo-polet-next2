import type { FaqTopicView } from "../types";

/**
 * Поиск по FAQ.
 *
 * Ищет по названию темы, тексту вопроса и тексту ответа. Тема остаётся в
 * выдаче, если совпал хотя бы один её вопрос; совпадение по названию темы
 * показывает её целиком — человек, набравший «доставка», ожидает увидеть весь
 * раздел о доставке, а не один вопрос из него.
 *
 * Отдельного поискового индекса здесь нет намеренно: вопросов в FAQ десятки, а
 * не десятки тысяч, и прямой перебор укладывается в доли миллисекунды. Индекс
 * добавил бы структуру, которую нужно поддерживать в согласии с данными, ради
 * незаметного выигрыша.
 *
 * Нормализация приводит регистр и убирает различие ё/е: «полет» должен
 * находить «полёт», иначе поиск выглядит сломанным для половины запросов на
 * русском.
 */

function normalize(value: string): string {
	return value.toLowerCase().replace(/ё/g, "е").trim();
}

export function filterFaqTopics(
	topics: FaqTopicView[],
	query: string,
): FaqTopicView[] {
	const needle = normalize(query);
	if (!needle) return topics;

	return topics
		.map((topic) => {
			const topicMatches =
				normalize(topic.title).includes(needle) ||
				(topic.description
					? normalize(topic.description).includes(needle)
					: false);

			if (topicMatches) return topic;

			const questions = topic.questions.filter(
				(question) =>
					normalize(question.question).includes(needle) ||
					normalize(question.plainAnswer).includes(needle),
			);

			return questions.length > 0 ? { ...topic, questions } : null;
		})
		.filter((topic): topic is FaqTopicView => topic !== null);
}

/** Сколько вопросов всего — для строки «найдено N». */
export function countQuestions(topics: FaqTopicView[]): number {
	return topics.reduce((total, topic) => total + topic.questions.length, 0);
}
