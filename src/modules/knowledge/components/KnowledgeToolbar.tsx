"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useKnowledgeFilters } from "../hooks/useKnowledgeFilters";

export interface FilterOption {
	slug: string;
	title: string;
	count: number;
}

interface KnowledgeToolbarProps {
	categories: FilterOption[];
	/** Секции выбранного раздела. Пусто — строка секций не рендерится вовсе. */
	sections: FilterOption[];
	totalTopics: number;
	resultCount: number | null;
}

/**
 * Поиск и фильтры базы знаний.
 *
 * Единственный клиентский компонент на всей странице списка: он только
 * переписывает адрес, а результаты рендерит сервер (см. useKnowledgeFilters).
 * Поэтому на клиент не уезжает ни корпус статей, ни слой запросов к нему —
 * при росте базы знаний вес страницы не меняется.
 */
export function KnowledgeToolbar({
	categories,
	sections,
	totalTopics,
	resultCount,
}: KnowledgeToolbarProps) {
	const {
		filters,
		isPending,
		debouncedSearch,
		clearSearch,
		setCategory,
		setSection,
		reset,
		activeCount,
	} = useKnowledgeFilters();

	const [value, setValue] = useState(filters.q);
	const inputRef = useRef<HTMLInputElement>(null);

	// Внешние изменения адреса (кнопка «назад», сброс фильтров, переход по
	// ссылке) должны отражаться в поле — иначе оно показывает прошлый запрос.
	useEffect(() => {
		setValue(filters.q);
	}, [filters.q]);

	const handleClear = () => {
		setValue("");
		clearSearch();
		inputRef.current?.focus();
	};

	return (
		<div
			className={cn(
				// Панель липнет под общей шапкой: в длинном списке материалов поиск
				// должен быть под рукой, а не «где-то вверху страницы».
				"sticky top-[var(--sticky-header-height)] z-20 -mx-4 flex flex-col gap-3 !px-4 !py-3 sm:mx-0 sm:!px-0",
				"knowledge-toolbar backdrop-blur-xl backdrop-saturate-150",
			)}
		>
			{/* ── Поиск ───────────────────────────────────────────────────────── */}
			<div className="relative">
				<Search
					size={17}
					aria-hidden
					className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
				/>

				<input
					ref={inputRef}
					type="search"
					value={value}
					onChange={(event) => {
						setValue(event.target.value);
						debouncedSearch(event.target.value);
					}}
					placeholder="Поиск по базе знаний"
					aria-label="Поиск по базе знаний"
					// Результаты живут в отдельном регионе: связываем их с полем,
					// чтобы скринридер объявлял изменение выдачи при вводе.
					aria-controls="knowledge-results"
					className={cn(
						"h-12 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]",
						"!pl-11 !pr-11 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
						"transition-colors duration-200 outline-none",
						"focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25",
						// Нативный крестик Safari/Chrome дублировал бы нашу кнопку.
						"[&::-webkit-search-cancel-button]:appearance-none",
					)}
				/>

				{value && (
					<button
						type="button"
						onClick={handleClear}
						aria-label="Очистить поиск"
						className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-[color,background-color,transform] duration-150 hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] active:scale-90"
					>
						<X size={15} aria-hidden />
					</button>
				)}
			</div>

			{/* ── Разделы ─────────────────────────────────────────────────────── */}
			{categories.length > 0 && (
				<ChipRow label="Разделы">
					<Chip
						active={!filters.category}
						onClick={() => setCategory(null)}
						label="Все"
						count={totalTopics}
					/>
					{categories.map((category) => (
						<Chip
							key={category.slug}
							active={filters.category === category.slug}
							onClick={() =>
								setCategory(
									filters.category === category.slug ? null : category.slug,
								)
							}
							label={category.title}
							count={category.count}
						/>
					))}
				</ChipRow>
			)}

			{/* ── Секции выбранного раздела ───────────────────────────────────── */}
			{sections.length > 0 && (
				<ChipRow label="Секции" tone="muted">
					<Chip
						active={!filters.section}
						onClick={() => setSection(null)}
						label="Все секции"
						tone="muted"
					/>
					{sections.map((section) => (
						<Chip
							key={section.slug}
							active={filters.section === section.slug}
							onClick={() =>
								setSection(
									filters.section === section.slug ? null : section.slug,
								)
							}
							label={section.title}
							count={section.count}
							tone="muted"
						/>
					))}
				</ChipRow>
			)}

			{/* ── Статус выдачи ───────────────────────────────────────────────── */}
			<div className="flex min-h-[1.25rem] flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
				<p
					// Изменения выдачи объявляются вежливо: пользователь скринридера
					// узнаёт, что результаты обновились, не теряя фокус в поле.
					aria-live="polite"
					className={cn(
						"text-[var(--text-secondary)] transition-opacity duration-200",
						isPending && "opacity-55",
					)}
				>
					{isPending ? (
						<span className="inline-flex items-center gap-2">
							<SlidersHorizontal
								size={13}
								aria-hidden
								className="animate-pulse text-[var(--text-muted)]"
							/>
							Обновляем подборку…
						</span>
					) : resultCount === null ? (
						<>
							<span className="font-semibold text-[var(--text-primary)]">
								{totalTopics}
							</span>{" "}
							{pluralizeMaterials(totalTopics)} в базе знаний
						</>
					) : resultCount === 0 ? (
						"Ничего не нашлось"
					) : (
						<>
							Нашли{" "}
							<span className="font-semibold text-[var(--text-primary)]">
								{resultCount}
							</span>{" "}
							{pluralizeMaterials(resultCount)}
						</>
					)}
				</p>

				{activeCount > 0 && (
					<button
						type="button"
						onClick={reset}
						className="text-xs font-medium text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline"
					>
						Сбросить всё
					</button>
				)}
			</div>
		</div>
	);
}

// ── Мелочи ──────────────────────────────────────────────────────────────────

function ChipRow({
	label,
	tone = "default",
	children,
}: {
	label: string;
	tone?: "default" | "muted";
	children: React.ReactNode;
}) {
	return (
		// На узком экране ряд прокручивается горизонтально вместо переноса:
		// перенос превращал бы десяток разделов в четыре строки чипов и
		// отодвигал бы сам список материалов за пределы экрана.
		<div
			role="group"
			aria-label={label}
			className={cn(
				"-mx-4 flex snap-x gap-2 overflow-x-auto !px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:!px-0",
				"[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				tone === "muted" && "animate-[fade-in_0.2s_ease-out]",
			)}
		>
			{children}
		</div>
	);
}

function Chip({
	active,
	onClick,
	label,
	count,
	tone = "default",
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	count?: number;
	tone?: "default" | "muted";
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border !px-3.5 !py-1.5 font-medium",
				"transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[0.97]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
				tone === "muted" ? "text-xs" : "text-sm",
				// Выбранный фильтр — подсветка, а не заливка фирменным оранжевым:
				// сплошная заливка конкурировала бы по весу с главной кнопкой
				// страницы, а белый текст на #FF4500 даёт всего 3.4:1 контраста
				// при размере 14px (нужно 4.5:1). Тинт + рамка того же цвета
				// читаются как «выбрано» так же однозначно, а светлый оттенок
				// шкалы даёт больше 8:1.
				active
					? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary-200)]"
					: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-light)] hover:text-[var(--text-primary)]",
			)}
		>
			{label}
			{count !== undefined && (
				<span
					className={cn(
						"tabular-nums",
						active ? "text-[var(--primary-300)]" : "text-[var(--text-muted)]",
					)}
				>
					{count}
				</span>
			)}
		</button>
	);
}

function pluralizeMaterials(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "материал";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
		return "материала";
	return "материалов";
}
