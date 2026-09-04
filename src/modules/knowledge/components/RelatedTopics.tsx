import { RELATED_LIMIT } from "../lib/constants";
import type { KnowledgeTopicSummary } from "../types";
import { TopicRow } from "./TopicRow";

/**
 * «Рекомендуем прочитать» под статьёй.
 *
 * Список задаёт редактор в админке — автоматического подбора здесь нет
 * сознательно: в руководствах связь между материалами смысловая («сначала
 * прочитайте про обслуживание»), и угадать её по совпадению слов нельзя.
 * Если редактор ничего не выбрал, блок не рендерится вовсе — пустая рамка с
 * заголовком хуже её отсутствия.
 */
export function RelatedTopics({ topics }: { topics: KnowledgeTopicSummary[] }) {
	if (topics.length === 0) return null;

	return (
		<section
			aria-labelledby="related-heading"
			className="mt-14 border-t border-[var(--border)] pt-8"
		>
			<h2
				id="related-heading"
				className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]"
			>
				Рекомендуем прочитать
			</h2>

			<ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
				{topics.slice(0, RELATED_LIMIT).map((topic) => (
					<li key={topic.id}>
						<TopicRow
							topic={topic}
							showCategory
							className="mx-0 rounded-none !px-4 hover:bg-[var(--surface-secondary)]"
						/>
					</li>
				))}
			</ul>
		</section>
	);
}
