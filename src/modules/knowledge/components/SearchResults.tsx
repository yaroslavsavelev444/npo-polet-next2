import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { toHighlightStems } from "../lib/search";
import type { KnowledgeFilters, KnowledgeSearchResult } from "../types";
import { TopicRow } from "./TopicRow";

interface SearchResultsProps {
	result: KnowledgeSearchResult;
	filters: KnowledgeFilters;
}

/**
 * Плоская выдача: включается, как только задан поиск или фильтр.
 *
 * Именно плоская, а не сгруппированная по разделам: когда человек ищет
 * конкретное, структура мешает — нужен один список, отсортированный по
 * релевантности, с указанием раздела у каждой находки.
 */
export function SearchResults({ result, filters }: SearchResultsProps) {
	const terms = toHighlightStems(filters.q);

	if (result.hits.length === 0) {
		return <EmptyState filters={filters} />;
	}

	return (
		<div className="flex flex-col gap-6">
			{/* Заголовок только для скринридера: визуально выдачу подписывает
			    строка «Нашли N материалов» в панели фильтров, но без h2 карточки
			    результатов оказывались бы на уровень ниже h1 с пропуском. */}
			<h2 className="sr-only">Результаты поиска</h2>

			<ul className="flex flex-col">
				{result.hits.map((hit, index) => (
					<li
						key={hit.id}
						className="reveal-up border-b border-[var(--border)] last:border-b-0"
						style={{
							// Короткая лесенка появления: она показывает, что список
							// перерисовался, и не превращается в ожидание — задержка
							// упирается в потолок уже на шестом элементе.
							["--reveal-delay" as string]: `${Math.min(index, 6) * 30}ms`,
						}}
					>
						<TopicRow
							topic={hit}
							terms={terms}
							snippet={hit.snippet}
							showCategory
							className="!py-4"
						/>
					</li>
				))}
			</ul>

			{result.totalPages > 1 && (
				<Pagination
					page={result.page}
					totalPages={result.totalPages}
					filters={filters}
				/>
			)}
		</div>
	);
}

/**
 * Пагинация обычными ссылками, а не кнопками с обработчиком: страницы выдачи
 * должны открываться в новой вкладке, работать без JS и попадать в историю
 * браузера как отдельные адреса.
 */
function Pagination({
	page,
	totalPages,
	filters,
}: {
	page: number;
	totalPages: number;
	filters: KnowledgeFilters;
}) {
	const hrefFor = (target: number) => {
		const params = new URLSearchParams();
		if (filters.q) params.set("q", filters.q);
		if (filters.category) params.set("category", filters.category);
		if (filters.section) params.set("section", filters.section);
		if (target > 1) params.set("page", String(target));
		const query = params.toString();
		return query ? `/knowledge?${query}` : "/knowledge";
	};

	// Окно вокруг текущей страницы: при сотне страниц полный список номеров не
	// помещается на телефоне и не нужен — навигация идёт «шагами».
	const window = 1;
	const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
		(candidate) =>
			candidate === 1 ||
			candidate === totalPages ||
			Math.abs(candidate - page) <= window,
	);

	return (
		<nav aria-label="Страницы результатов" className="flex justify-center">
			<ul className="flex flex-wrap items-center gap-1.5">
				<li>
					<PageLink
						href={hrefFor(page - 1)}
						disabled={page <= 1}
						label="Предыдущая страница"
					>
						<ChevronLeft size={16} aria-hidden />
					</PageLink>
				</li>

				{pages.map((candidate, index) => (
					<li key={candidate} className="flex items-center gap-1.5">
						{index > 0 && candidate - pages[index - 1] > 1 && (
							<span
								aria-hidden
								className="px-1 text-sm text-[var(--text-muted)]"
							>
								…
							</span>
						)}
						<PageLink
							href={hrefFor(candidate)}
							current={candidate === page}
							label={`Страница ${candidate}`}
						>
							{candidate}
						</PageLink>
					</li>
				))}

				<li>
					<PageLink
						href={hrefFor(page + 1)}
						disabled={page >= totalPages}
						label="Следующая страница"
					>
						<ChevronRight size={16} aria-hidden />
					</PageLink>
				</li>
			</ul>
		</nav>
	);
}

function PageLink({
	href,
	label,
	current,
	disabled,
	children,
}: {
	href: string;
	label: string;
	current?: boolean;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	const className = cn(
		"flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border !px-2.5 text-sm font-medium",
		"transition-[background-color,border-color,color] duration-200",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
		current
			? "border-[var(--primary)] bg-[var(--primary)] text-white"
			: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-light)] hover:text-[var(--text-primary)]",
	);

	if (disabled) {
		return (
			<span
				aria-hidden
				className={cn(className, "cursor-not-allowed opacity-35")}
			>
				{children}
			</span>
		);
	}

	return (
		<Link
			href={href}
			aria-label={label}
			aria-current={current ? "page" : undefined}
			scroll
			className={className}
		>
			{children}
		</Link>
	);
}

function EmptyState({ filters }: { filters: KnowledgeFilters }) {
	return (
		<div className="reveal-up flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-light)] !px-6 !py-14 text-center">
			<SearchX
				size={26}
				strokeWidth={1.5}
				aria-hidden
				className="text-[var(--text-muted)]"
			/>

			<p className="text-base font-medium text-[var(--text-primary)]">
				{filters.q ? (
					<>По запросу «{filters.q}» ничего нет</>
				) : (
					"В этом разделе пока пусто"
				)}
			</p>

			<p className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
				{filters.q
					? "Попробуйте другое слово или уберите фильтр по разделу — возможно, материал лежит в другом месте."
					: "Материалы появятся здесь, как только их опубликуют."}
			</p>

			<Link
				href="/knowledge"
				className="mt-1 text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
			>
				Показать все материалы
			</Link>
		</div>
	);
}
