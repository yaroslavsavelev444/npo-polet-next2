"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollProgress } from "@/shared/components/motion/useScrollProgress";
import { cn } from "@/utils/cn";
import { principle } from "../content/home-content";
import { Container, Section, Value } from "./primitives";

/**
 * Принцип работы: липкая схема слева, такты справа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КАК ЭТО ДВИЖЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Хук useScrollProgress пишет в секцию переменную --p (0..1) — долю пути,
 * пройденную липким блоком. Дальше вся анимация схемы описана в CSS через
 * calc() от этой переменной: React не участвует ни в одном кадре.
 *
 * Три такта получаются нарезкой --p на отрезки прямо в CSS (--p1/--p2/--p3),
 * поэтому «где мы в анимации» — производная от положения страницы, а не
 * отдельное состояние, которое может с ним разъехаться.
 *
 * Подсветка активного такта в тексте живёт отдельно, на IntersectionObserver:
 * она должна следовать за ЧТЕНИЕМ (какой абзац сейчас в середине экрана), а
 * это не то же самое, что доля прокрутки секции.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУПНОСТЬ И SEO
 * ────────────────────────────────────────────────────────────────────────────
 * Схема — иллюстрация к тексту, а не носитель информации: всё, что она
 * показывает, написано словами в тактах рядом. Поэтому у неё aria-hidden, и
 * ни один факт не заперт внутри SVG.
 */
export function PrincipleSection() {
	const sectionRef = useScrollProgress<HTMLDivElement>({ mode: "sticky" });
	const [activeStep, setActiveStep] = useState(0);
	const stepsRef = useRef<Array<HTMLLIElement | null>>([]);

	useEffect(() => {
		const nodes = stepsRef.current.filter(Boolean) as HTMLLIElement[];
		if (!nodes.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const index = nodes.indexOf(entry.target as HTMLLIElement);
					if (index >= 0) setActiveStep(index);
				}
			},
			// Узкая полоса в середине экрана: активным считается такт,
			// который читатель сейчас держит перед глазами.
			{ rootMargin: "-45% 0px -45% 0px", threshold: 0 },
		);

		for (const node of nodes) observer.observe(node);
		return () => observer.disconnect();
	}, []);

	return (
		<Section id="principle" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<div className="mb-[clamp(2.5rem,5vw,4rem)] flex flex-col gap-4">
					<h2 className="text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
						{principle.title}
					</h2>
					<p className="max-w-[54ch] text-[clamp(0.9375rem,0.88rem+0.25vw,1.0625rem)] leading-relaxed text-[var(--text-secondary)]">
						{principle.intro}
					</p>
				</div>

				<div
					ref={sectionRef}
					className="grid gap-[clamp(1.5rem,3vw,4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
				>
					{/* Схема. sticky работает и на телефоне: она занимает
					    верхнюю треть экрана, а такты идут под ней. */}
					<div className="sticky top-[calc(var(--sticky-header-height)+1rem)] z-10 self-start">
						<div className="reticle relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--void-deep)]">
							<InterceptDiagram activeStep={activeStep} />
						</div>
					</div>

					<ol className="flex list-none flex-col p-0">
						{principle.steps.map((step, index) => {
							const isActive = activeStep === index;
							return (
								<li
									key={step.index}
									ref={(node) => {
										stepsRef.current[index] = node;
									}}
									// Минимальная высота такта — это ДЛИНА ПРОКРУТКИ, а не
									// отступ: именно она задаёт, сколько экрана
									// проезжает читатель, пока схема отыгрывает один
									// такт. Задана на всех ширинах, а не только на
									// десктопе: пока её не было на узких экранах,
									// список тактов оказывался короче окна, весь
									// прогресс (--p) пробегал от 0 до 1 за пару сотен
									// пикселей, и схема прыгала сразу в финальное
									// состояние, не показав ни выстрела, ни захвата.
									className="flex min-h-[68vh] items-center border-t border-[var(--rule)] py-[clamp(2rem,5vw,3.5rem)] last:border-b lg:min-h-[72vh] lg:py-[clamp(2.5rem,6vw,5rem)]"
								>
									<div className="flex w-full items-start gap-4 sm:gap-6">
										{/*
									  Номер такта — это порядковый номер шага в
									  последовательности, то есть та самая
									  информация, ради которой нумерация и
									  существует: такты выполняются строго друг
									  за другом.
									*/}
										{/*
									  Подсветка активного такта — условными классами, а
									  не вариантом group-data-[active=true]:. Tailwind в
									  этом проекте варианты с [data-…=true] не
									  генерирует: классы стоят в разметке, а правил для
									  них в собранном CSS нет, и подсветка молча не
									  работает. Подробнее — в SectionIndex.tsx.
									*/}
										<span
											className={cn(
												"u-mono shrink-0 pt-1 text-[0.6875rem] tabular-nums transition-colors duration-500",
												isActive
													? "text-[var(--primary)]"
													: "text-[var(--text-muted)]",
											)}
										>
											{step.index}
										</span>

										<div className="flex flex-col gap-3">
											<h3
												className={cn(
													"text-[clamp(1.25rem,0.95rem+1.1vw,1.875rem)] font-semibold tracking-[-0.02em] transition-colors duration-500",
													isActive
														? "text-[var(--text-primary)]"
														: "text-[var(--text-secondary)]",
												)}
											>
												{step.title}
											</h3>
											<p
												className={cn(
													"max-w-[46ch] text-[0.9375rem] leading-[1.7] transition-colors duration-500",
													isActive
														? "text-[var(--text-secondary)]"
														: "text-[var(--text-muted)]",
												)}
											>
												<Value data={step.body} />
											</p>
										</div>
									</div>
								</li>
							);
						})}
					</ol>
				</div>
			</Container>
		</Section>
	);
}

/**
 * Схема перехвата.
 *
 * Чистая геометрия: линия горизонта, позиция расчёта, аппарат, траектория и
 * раскрытие сети. Ничего не имитирует фотографию и не притворяется
 * иллюстрацией — это чертёж, и он честно выглядит чертежом.
 *
 * Все анимируемые величины — производные от --p (см. .principle-diagram в
 * home.css). Здесь только разметка.
 */
function InterceptDiagram({ activeStep }: { activeStep: number }) {
	return (
		// Высота схемы на узких экранах задана в долях окна, а не соотношением
		// сторон. Схема здесь ЛИПКАЯ: при аспекте 4/3 она занимала почти весь
		// экран телефона, и текст такта, ради которого она и рисуется,
		// оказывался за нижним краем — читатель видел анимацию без подписи и
		// подпись без анимации. Треть экрана оставляет место обоим.
		//
		// С lg работает двухколоночная раскладка, там схема стоит рядом с
		// текстом и может занимать столько, сколько ей нужно.
		<div className="principle-diagram relative h-[32vh] w-full lg:h-auto lg:aspect-[16/10]">
			<svg
				viewBox="0 0 400 300"
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
				focusable="false"
			>
				{/* Земля и разметка дистанции */}
				<line
					x1="0"
					y1="252"
					x2="400"
					y2="252"
					stroke="var(--rule)"
					strokeWidth="1"
				/>
				<g stroke="var(--rule)" strokeWidth="1">
					{Array.from({ length: 9 }, (_, i) => (
						<line key={i} x1={40 + i * 40} y1="252" x2={40 + i * 40} y2="258" />
					))}
				</g>

				{/* Позиция расчёта */}
				<g className="pd-launcher">
					<circle cx="60" cy="240" r="4" fill="var(--primary)" />
					<circle
						cx="60"
						cy="240"
						r="11"
						fill="none"
						stroke="var(--primary)"
						strokeWidth="1"
						opacity="0.4"
					/>
					<line
						x1="60"
						y1="240"
						x2="86"
						y2="222"
						stroke="var(--text-secondary)"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</g>

				{/* Линия визирования: появляется на первом такте */}
				<line
					className="pd-sightline"
					x1="60"
					y1="240"
					x2="308"
					y2="72"
					stroke="var(--accent)"
					strokeWidth="1"
					strokeDasharray="3 5"
				/>

				{/* Траектория: прочерчивается на втором такте.
				    pathLength="1" нормирует длину, поэтому dashoffset
				    считается прямо от прогресса, без измерения пути в JS. */}
				<path
					className="pd-trajectory"
					d="M 66 236 Q 150 96 304 74"
					fill="none"
					stroke="var(--primary)"
					strokeWidth="1.5"
					pathLength="1"
					strokeDasharray="1"
				/>

				{/* Аппарат */}
				<g className="pd-drone">
					<g stroke="var(--text-secondary)" strokeWidth="1.5" fill="none">
						<line x1="-13" y1="-9" x2="13" y2="9" />
						<line x1="13" y1="-9" x2="-13" y2="9" />
						<circle cx="-13" cy="-9" r="5.5" />
						<circle cx="13" cy="-9" r="5.5" />
						<circle cx="-13" cy="9" r="5.5" />
						<circle cx="13" cy="9" r="5.5" />
					</g>
					<rect
						x="-6"
						y="-4"
						width="12"
						height="8"
						rx="2"
						fill="var(--text-secondary)"
					/>
				</g>

				{/* Сеть: раскрывается на третьем такте */}
				<g className="pd-net">
					<circle
						r="34"
						fill="none"
						stroke="var(--primary)"
						strokeWidth="1"
						strokeDasharray="4 4"
					/>
					<circle
						r="34"
						fill="color-mix(in srgb, var(--primary) 12%, transparent)"
					/>
					{/* Ячейки сети — четыре хорды, а не растровая текстура. */}
					<g stroke="var(--primary)" strokeWidth="0.75" opacity="0.65">
						<line x1="-34" y1="0" x2="34" y2="0" />
						<line x1="0" y1="-34" x2="0" y2="34" />
						<line x1="-24" y1="-24" x2="24" y2="24" />
						<line x1="24" y1="-24" x2="-24" y2="24" />
					</g>
				</g>
			</svg>

			{/* Служебная строка под схемой: подпись текущего такта. Дублирует
			    заголовок активного шага — это подпись к рисунку, а не новая
			    информация, поэтому она скрыта от скринридера. */}
			<div
				className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-[var(--rule)] px-4 py-2.5"
				aria-hidden="true"
			>
				<span className="u-mono text-[0.625rem] text-[var(--text-muted)]">
					{principle.steps[activeStep]?.index} /{" "}
					{String(principle.steps.length).padStart(2, "0")}
				</span>
				<span className="u-mono text-[0.625rem] text-[var(--primary)]">
					{principle.steps[activeStep]?.title}
				</span>
			</div>
		</div>
	);
}
