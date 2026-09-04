import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/utils/cn";
import type { KnowledgeTopicSummary } from "../types";
import { HighlightedText } from "./HighlightedText";

interface TopicRowProps {
	topic: KnowledgeTopicSummary;
	/**
	 * Уровень заголовка карточки. Задаётся вызывающим, потому что глубина
	 * вложенности у списка разная: в обзоре над материалом стоят раздел (h2) и
	 * секция (h3), в выдаче поиска — только заголовок страницы. Пропуск уровня
	 * ломает навигацию скринридера по заголовкам.
	 */
	headingLevel?: 3 | 4;
	/** Слова запроса — подсвечиваются в заголовке и фрагменте. */
	terms?: string[];
	/** Фрагмент текста, по которому статья нашлась. */
	snippet?: string | null;
	/** Показывать раздел (нужно в плоской выдаче поиска, не нужно внутри раздела). */
	showCategory?: boolean;
	className?: string;
}

/**
 * Материал в списке — строка, а не карточка.
 *
 * Сетка одинаковых карточек с картинкой читается витриной: глаз идёт по
 * плиткам, а не по названиям, и на двадцати материалах поиск глазами
 * становится дольше, чем чтение списка. Строки сканируются вертикально за
 * один проход и одинаково работают и на пяти материалах, и на двухстах.
 */
export function TopicRow({
	topic,
	terms = [],
	snippet,
	showCategory = false,
	headingLevel = 3,
	className,
}: TopicRowProps) {
	const Heading = `h${headingLevel}` as const;
	const href = topic.categorySlug
		? `/knowledge/${topic.categorySlug}/${topic.slug}`
		: "/knowledge";

	return (
		<Link
			href={href}
			className={cn(
				"group flex items-start gap-3.5 rounded-[var(--radius-sm)] !px-3 !py-3 -mx-3",
				"transition-colors duration-200",
				"hover:bg-[var(--surface)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<Heading className="text-[0.9375rem] font-medium leading-snug text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--primary)]">
					<HighlightedText text={topic.title} terms={terms} />
				</Heading>

				{(snippet || topic.description) && (
					<p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">
						<HighlightedText
							text={snippet || topic.description || ""}
							terms={terms}
						/>
					</p>
				)}

				{(showCategory || topic.readingTime) && (
					<p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
						{showCategory && topic.categoryTitle && (
							<span>{topic.categoryTitle}</span>
						)}
						{topic.readingTime ? (
							<span className="inline-flex items-center gap-1">
								<Clock3 size={12} aria-hidden />
								{topic.readingTime} мин
							</span>
						) : null}
					</p>
				)}
			</div>

			<ArrowRight
				size={15}
				aria-hidden
				className="mt-1 shrink-0 text-[var(--text-muted)] opacity-0 transition-[opacity,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
			/>
		</Link>
	);
}
