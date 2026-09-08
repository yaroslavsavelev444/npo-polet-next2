"use client";

import { Search, X } from "lucide-react";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { countQuestions, filterFaqTopics } from "../lib/filterFaq";
import type { FaqTopicView } from "../types";
import { FaqAccordion } from "./FaqAccordion";

/**
 * Полный список вопросов с поиском — содержимое страницы /faq.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ФИЛЬТРАЦИЯ НА КЛИЕНТЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Все вопросы и так приходят на страницу целиком: они нужны в DOM ради
 * поисковых систем и разметки FAQPage. Раз данные уже здесь, запрос на сервер
 * за подмножеством того же самого добавил бы задержку и состояние загрузки,
 * ничего не выиграв.
 *
 * useDeferredValue держит поле ввода отзывчивым: перебор десятков вопросов
 * быстр, но при вводе он происходит на каждый символ, и React должен иметь
 * право отложить перерисовку списка ради отрисовки самой набранной буквы.
 */
export function FaqBrowser({ topics }: { topics: FaqTopicView[] }) {
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const inputId = useId();

	const filtered = useMemo(
		() => filterFaqTopics(topics, deferredQuery),
		[topics, deferredQuery],
	);

	const total = useMemo(() => countQuestions(filtered), [filtered]);
	const isSearching = deferredQuery.trim().length > 0;

	return (
		<div className="flex flex-col gap-[clamp(2rem,4vw,3.5rem)]">
			{/* ── Поиск ──────────────────────────────────────────────────── */}
			<div className="flex flex-col gap-3">
				<label htmlFor={inputId} className="sr-only">
					Поиск по вопросам
				</label>
				<div className="relative flex items-center">
					<Search
						className="pointer-events-none absolute left-4 size-4 text-[var(--text-muted)]"
						aria-hidden="true"
					/>
					<input
						id={inputId}
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Найти вопрос — например, «доставка» или «разрешение»"
						className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] py-3.5 pl-11 pr-11 text-[0.9375rem] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors duration-200 focus:border-[var(--border-light)] focus:outline-none"
					/>
					{query ? (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-3 rounded-full p-1.5 text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
							aria-label="Очистить поиск"
						>
							<X className="size-4" aria-hidden="true" />
						</button>
					) : null}
				</div>

				{/*
				  Результат поиска объявляется вслух: пользователь
				  скринридера иначе не узнает, что список под полем изменился.
				  aria-live="polite" не перебивает набор текста.
				*/}
				<p
					aria-live="polite"
					className="min-h-[1.25rem] text-[0.8125rem] text-[var(--text-muted)]"
				>
					{isSearching
						? total > 0
							? `Найдено вопросов: ${total}`
							: "Ничего не найдено"
						: ""}
				</p>
			</div>

			{/* ── Список ─────────────────────────────────────────────────── */}
			{filtered.length === 0 ? (
				<div className="border-t border-[var(--rule)] py-[clamp(3rem,8vw,5rem)] text-center">
					<p className="text-[1.0625rem] text-[var(--text-secondary)]">
						По запросу «{deferredQuery.trim()}» ничего не нашлось.
					</p>
					<p className="mt-2 text-[0.9375rem] text-[var(--text-muted)]">
						Попробуйте другую формулировку или{" "}
						<a
							href="/contacts"
							className="text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:decoration-current"
						>
							задайте вопрос напрямую
						</a>
						.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-[clamp(2.5rem,5vw,4.5rem)]">
					{filtered.map((topic) => (
						<section
							key={topic.id}
							id={topic.slug}
							aria-labelledby={`topic-${topic.id}`}
							className="scroll-mt-[7rem]"
						>
							<div className="grid gap-[clamp(1rem,3vw,3rem)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
								{/*
								  Название темы «прилипает» к верху, пока
								  читаются её вопросы: в длинном списке легко
								  забыть, к какому разделу относится вопрос,
								  который сейчас перед глазами.
								*/}
								<div className="lg:sticky lg:top-[calc(var(--sticky-header-height)+2rem)]">
									<h2
										id={`topic-${topic.id}`}
										className="text-[clamp(1.25rem,1rem+0.9vw,1.75rem)] font-bold tracking-[-0.02em] text-[var(--text-primary)]"
									>
										{topic.title}
									</h2>
									{topic.description ? (
										<p className="mt-2 max-w-[36ch] text-[0.875rem] leading-[1.6] text-[var(--text-muted)]">
											{topic.description}
										</p>
									) : null}
									<p className="u-mono mt-3 text-[0.625rem] text-[var(--text-muted)]">
										{topic.questions.length}{" "}
										{pluralizeQuestions(topic.questions.length)}
									</p>
								</div>

								<FaqAccordion
									questions={topic.questions}
									// На отдельной странице ограничение «открыт
									// только один» мешает: сюда приходят
									// сравнивать ответы, а не читать по одному.
									exclusive={false}
									size="large"
								/>
							</div>
						</section>
					))}
				</div>
			)}
		</div>
	);
}

/** Русское склонение после числительного: 1 вопрос, 2 вопроса, 5 вопросов. */
function pluralizeQuestions(count: number): string {
	const mod100 = count % 100;
	if (mod100 >= 11 && mod100 <= 14) return "вопросов";
	switch (count % 10) {
		case 1:
			return "вопрос";
		case 2:
		case 3:
		case 4:
			return "вопроса";
		default:
			return "вопросов";
	}
}
