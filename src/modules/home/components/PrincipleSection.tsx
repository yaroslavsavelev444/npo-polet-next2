"use client";

import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useScrollProgress } from "@/shared/components/motion/useScrollProgress";
import { cn } from "@/utils/cn";
import { principle } from "../content/home-content";
import {
	createInterceptScene,
	type InterceptScene,
} from "../lib/intercept-scene";
import { Container, Section, Value } from "./primitives";

/**
 * Принцип работы: липкая схема слева, такты справа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КАК ЭТО ДВИЖЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Хук useScrollProgress считает долю пути (0..1), пройденную липким блоком,
 * и отдаёт её сцене напрямую (onProgress), минуя React: ни один кадр
 * анимации не вызывает ре-рендер.
 *
 * Три такта получаются нарезкой прогресса на отрезки внутри сцены, поэтому
 * «где мы в анимации» — производная от положения страницы, а не отдельное
 * состояние, которое может с ним разъехаться.
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
 * ни один факт не заперт внутри canvas.
 */
export function PrincipleSection() {
	const sceneRef = useRef<InterceptScene | null>(null);
	const onProgress = useCallback((progress: number) => {
		sceneRef.current?.setProgress(progress);
	}, []);
	const sectionRef = useScrollProgress<HTMLDivElement>({
		mode: "sticky",
		onProgress,
	});
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
							<InterceptDiagram activeStep={activeStep} sceneRef={sceneRef} />
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
 * Трёхмерная сцена на canvas: позиция расчёта, пусковое устройство,
 * аппарат, полёт и раскрытие сети, захват и падение в прогнозируемую зону.
 * Вся геометрия, физика и отрисовка — в lib/intercept-scene.ts; здесь только
 * монтирование и подпись такта.
 *
 * Прогресс приходит снаружи (onProgress хука прокрутки секции) через
 * sceneRef, поэтому React по-прежнему не участвует ни в одном кадре.
 */
function InterceptDiagram({
	activeStep,
	sceneRef,
}: {
	activeStep: number;
	sceneRef: RefObject<InterceptScene | null>;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const probeRef = useRef<HTMLSpanElement | null>(null);
	const fontRef = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const probe = probeRef.current;
		const fontSource = fontRef.current;
		if (!canvas || !probe || !fontSource) return;
		const scene = createInterceptScene(canvas, { probe, fontSource });
		sceneRef.current = scene;
		return () => {
			scene.destroy();
			sceneRef.current = null;
		};
	}, [sceneRef]);

	return (
		// Высота схемы на узких экранах задана в долях окна, а не соотношением
		// сторон. Схема здесь ЛИПКАЯ: при аспекте 4/3 она занимала почти весь
		// экран телефона, и текст такта, ради которого она и рисуется,
		// оказывался за нижним краем — читатель видел анимацию без подписи и
		// подпись без анимации. Треть экрана оставляет место обоим.
		//
		// С lg работает двухколоночная раскладка, там схема стоит рядом с
		// текстом и может занимать столько, сколько ей нужно.
		<div className="principle-diagram relative h-[32vh] min-h-[220px] w-full lg:h-auto lg:aspect-[16/10]">
			<canvas
				ref={canvasRef}
				className="absolute inset-0 h-full w-full"
				aria-hidden="true"
			/>
			{/* Проба цветов темы: сцена читает через неё разрешённые токены. */}
			<span ref={probeRef} className="hidden" aria-hidden="true" />

			{/* Служебная строка под схемой: подпись текущего такта. Дублирует
			    заголовок активного шага — это подпись к рисунку, а не новая
			    информация, поэтому она скрыта от скринридера. */}
			<div
				className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--void-deep)_82%,transparent)] px-4 py-2.5 backdrop-blur-sm"
				aria-hidden="true"
			>
				<span
					ref={fontRef}
					className="u-mono text-[0.625rem] text-[var(--text-muted)]"
				>
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
