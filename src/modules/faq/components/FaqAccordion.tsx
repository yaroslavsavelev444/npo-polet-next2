"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import type { FaqQuestionView } from "../types";
import { FaqAnswer } from "./FaqAnswer";

/**
 * Аккордеон вопросов — общий для главной и для страницы /faq.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТВЕТ ВСЕГДА В DOM
 * ────────────────────────────────────────────────────────────────────────────
 * Свёрнутый пункт скрыт геометрией (grid-template-rows: 0fr + overflow),
 * а не display:none и не отсутствием узла. Это принципиально:
 *  — поисковый робот видит текст ответа, и разметка FAQPage не расходится с
 *    содержимым страницы (Google это проверяет);
 *  — поиск браузера (Ctrl+F) находит текст;
 *  — высота анимируется без единого измерения в JS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ <details>
 * ────────────────────────────────────────────────────────────────────────────
 * У <details name="..."> есть штатный «эксклюзивный» режим и бесплатная
 * доступность, но браузер показывает и прячет содержимое мгновенно: переход по
 * grid-template-rows при закрытии не успевает проиграть. Анимировать это
 * штатно позволяет ::details-content с transition-behavior: allow-discrete,
 * который поддержан ещё не везде. Кнопка с aria-expanded/aria-controls даёт то
 * же поведение предсказуемо во всех браузерах.
 *
 * Без JavaScript пункты не раскрывались бы вовсе — на этот случай в
 * FaqNoScriptStyles лежит правило, раскрывающее все ответы.
 */

interface FaqAccordionProps {
	questions: FaqQuestionView[];
	/**
	 * Раскрывать только один пункт за раз. На главной это удерживает высоту
	 * блока предсказуемой; на странице FAQ — позволяет сравнивать ответы,
	 * поэтому там режим выключен.
	 */
	exclusive?: boolean;
	/** Индекс изначально раскрытого пункта. -1 — все свёрнуты. */
	defaultOpen?: number;
	/** Крупнее на отдельной странице, компактнее в блоке главной. */
	size?: "compact" | "large";
	className?: string;
}

export function FaqAccordion({
	questions,
	exclusive = true,
	defaultOpen = -1,
	size = "compact",
	className,
}: FaqAccordionProps) {
	const baseId = useId();
	const [open, setOpen] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		const first = questions[defaultOpen];
		if (first) initial.add(first.id);
		return initial;
	});

	const toggle = useCallback(
		(id: string) => {
			setOpen((current) => {
				const next = exclusive ? new Set<string>() : new Set(current);
				if (current.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return next;
			});
		},
		[exclusive],
	);

	// Прямая ссылка на вопрос (/faq#kak-dostavlyaete) должна открыть именно
	// его. Браузер сам доскроллит до якоря, но раскрыть пункт может только
	// приложение — без этого человек попадает на свёрнутую строку и не
	// понимает, зачем его сюда привели.
	//
	// Обработчик обязан висеть и на hashchange, а не отрабатывать только при
	// монтировании. Переход по якорю со страницы, которая УЖЕ открыта
	// (ссылка внутри самого FAQ, ссылка из поиска на той же вкладке), — это
	// навигация в пределах документа: компонент не перемонтируется, эффект
	// монтирования не повторяется, и раскрытым остаётся тот пункт, который был
	// раскрыт до перехода.
	useEffect(() => {
		const openFromHash = () => {
			const hash = decodeURIComponent(window.location.hash.replace("#", ""));
			if (!hash) return;
			const target = questions.find((question) => question.slug === hash);
			// Слаг из чужой темы — не наш случай: на странице несколько
			// аккордеонов, и отреагировать должен ровно тот, где такой вопрос есть.
			if (!target) return;

			setOpen((current) =>
				exclusive ? new Set([target.id]) : new Set(current).add(target.id),
			);

			// Прокрутка после раскрытия: к моменту, когда браузер сам прыгает к
			// якорю, пункт ещё свёрнут, и позиция получается неверной.
			requestAnimationFrame(() => {
				document
					.getElementById(target.slug)
					?.scrollIntoView({ block: "center", behavior: "auto" });
			});
		};

		openFromHash();
		window.addEventListener("hashchange", openFromHash);
		return () => window.removeEventListener("hashchange", openFromHash);
	}, [questions, exclusive]);

	if (questions.length === 0) return null;

	return (
		<ul className={cn("flex list-none flex-col p-0", className)}>
			{questions.map((question, index) => {
				const isOpen = open.has(question.id);
				const panelId = `${baseId}-panel-${index}`;
				const buttonId = `${baseId}-button-${index}`;

				return (
					<Reveal
						as="li"
						key={question.id}
						delay={index * 60}
						className="group border-t border-[var(--rule)] last:border-b"
					>
						{/* id висит на строке, а не на кнопке: якорь должен
						    приводить к началу пункта вместе с его отбивкой. */}
						<div id={question.slug} className="scroll-mt-[8rem]">
							<h3 className="m-0">
								<button
									type="button"
									id={buttonId}
									aria-expanded={isOpen}
									aria-controls={panelId}
									onClick={() => toggle(question.id)}
									className={cn(
										"flex w-full items-start justify-between gap-6 bg-transparent text-left transition-colors duration-300",
										"text-[var(--text-primary)] hover:text-[var(--primary)]",
										size === "large"
											? "py-[clamp(1.25rem,2.4vw,2rem)] text-[clamp(1.0625rem,0.9rem+0.9vw,1.75rem)]"
											: "py-[clamp(1rem,1.8vw,1.5rem)] text-[clamp(1rem,0.92rem+0.5vw,1.3125rem)]",
										"font-semibold tracking-[-0.02em] leading-[1.35]",
									)}
								>
									{/* Сдвиг вправо при наведении: строка отзывается
									    на курсор раньше, чем человек её нажмёт. */}
									<span className="transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)] group-hover:translate-x-1">
										{question.question}
									</span>
									<Indicator open={isOpen} />
								</button>
							</h3>

							<div
								id={panelId}
								role="region"
								aria-labelledby={buttonId}
								className="accordion-panel"
								data-open={isOpen}
							>
								<div>
									<div
										className={cn(
											"pb-[clamp(1.25rem,2.4vw,2rem)]",
											size === "large"
												? "max-w-[68ch] pr-8"
												: "max-w-[62ch] pr-6",
										)}
									>
										<FaqAnswer answer={question.answer} />
									</div>
								</div>
							</div>
						</div>
					</Reveal>
				);
			})}
		</ul>
	);
}

/**
 * Указатель состояния: плюс, который доворачивается в минус.
 *
 * Две линии, а не иконка из библиотеки: нужно, чтобы вертикальный штрих
 * поворачивался и исчезал отдельно от горизонтального — так переход читается
 * как одно движение, а не как подмена одной картинки другой.
 */
function Indicator({ open }: { open: boolean }) {
	return (
		<span
			aria-hidden="true"
			data-open={open}
			className="relative mt-[0.35em] block size-3.5 shrink-0"
		>
			<span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current transition-colors duration-300" />
			<span
				className={cn(
					"absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current",
					"transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)]",
					open ? "rotate-90 scale-y-0" : "rotate-0 scale-y-100",
				)}
			/>
		</span>
	);
}

/**
 * Раскрывает все ответы при отключённом JavaScript.
 *
 * Кнопка без обработчика бесполезна, и без этого правила страница FAQ
 * превратилась бы в список вопросов без единого ответа. Ставится один раз на
 * страницу, рядом с аккордеоном.
 */
export function FaqNoScriptStyles() {
	return (
		<noscript>
			<style>{`
				.accordion-panel { grid-template-rows: 1fr !important; }
				.accordion-panel > * { opacity: 1 !important; transform: none !important; }
			`}</style>
		</noscript>
	);
}
