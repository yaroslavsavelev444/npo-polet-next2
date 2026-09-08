import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { FaqQuestionView } from "@/modules/faq";
import { FaqAccordion, FaqNoScriptStyles } from "@/modules/faq";
import { Reveal } from "@/shared/components/motion/Reveal";
import { faq } from "../content/home-content";
import { Container, Section } from "./primitives";

/**
 * FAQ на главной — выборка, а не весь список.
 *
 * Пять вопросов: шестой и дальше начинают спорить по высоте с финальным
 * призывом, ради которого написана вся страница. Какие именно вопросы сюда
 * попадут, решает администратор галочкой «показывать на главной» у вопроса —
 * самые частые вопросы и логичный порядок чтения полного FAQ это разные
 * последовательности.
 *
 * Разметки FAQPage здесь намеренно НЕТ: она стоит только на /faq. Две страницы
 * с одинаковой разметкой по одной теме конкурируют между собой в выдаче, и
 * поисковик выбирает из них сам — обычно не ту, которую хотелось бы.
 */
export function FaqSection({ questions }: { questions: FaqQuestionView[] }) {
	return (
		<Section id="faq" tone="void" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<div className="grid gap-[clamp(2rem,4vw,4rem)] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
					{/* Заголовок держится у верха, пока читаются ответы: тот же
					    приём, что и на странице FAQ, — чтобы два экрана
					    ощущались одной системой. */}
					<Reveal className="lg:sticky lg:top-[calc(var(--sticky-header-height)+2rem)]">
						<div className="flex flex-col gap-4">
							<h2 className="text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
								{faq.title}
							</h2>
							<p className="max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
								{faq.intro}
							</p>

							<Link
								href={faq.cta.href}
								className="group mt-2 inline-flex items-center gap-2.5 self-start text-[0.9375rem] font-medium text-[var(--text-primary)] no-underline"
							>
								<span className="border-b border-[var(--rule)] pb-0.5 transition-colors duration-200 group-hover:border-[var(--primary)]">
									{faq.cta.label}
								</span>
								<ArrowRight
									className="size-4 transition-transform duration-200 group-hover:translate-x-1"
									aria-hidden="true"
								/>
							</Link>
						</div>
					</Reveal>

					{questions.length === 0 ? (
						<p className="border-t border-[var(--rule)] pt-6 text-[0.9375rem] text-[var(--text-muted)]">
							{faq.emptyMessage}
						</p>
					) : (
						<>
							<FaqAccordion
								questions={questions}
								// На главной высота блока должна оставаться
								// предсказуемой: раскрытые вподряд ответы
								// растянули бы секцию на два экрана.
								exclusive
								defaultOpen={0}
								size="compact"
							/>
							<FaqNoScriptStyles />
						</>
					)}
				</div>
			</Container>
		</Section>
	);
}
