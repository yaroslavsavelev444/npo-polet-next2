import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/shared/components/motion/Reveal";
import { audience } from "../content/home-content";
import { Container, Section, SectionHeading } from "./primitives";

/**
 * Кто и что защищает.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ БЫЛО РАНЬШЕ И ПОЧЕМУ ЗАМЕНЕНО
 * ────────────────────────────────────────────────────────────────────────────
 * Раздел был построен как противопоставление двух колонок — «частным лицам»
 * против «организациям», с разными условиями покупки в каждой. Это оказалось
 * неверно по существу: изделия одни и те же, покупают их одинаково, никаких
 * коммерческих предложений компания не составляет. Единственное реальное
 * отличие — дилерская скидка.
 *
 * Противопоставления, которого нет, на странице быть не должно: оно заставляет
 * посетителя выбирать колонку и делать вывод, что «для него» условия другие.
 * Поэтому раздел отвечает на вопрос, который у посетителя действительно есть,
 * — «а мне это зачем»: перечисляет сценарии применения и то, что в каждом
 * прикрывают. Условия покупки сведены в одну строку под сеткой, где им и место.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СЕТКА, А НЕ ПОЛОСЫ
 * ────────────────────────────────────────────────────────────────────────────
 * Соседний раздел «Направления» уже построен полноширинными полосами, и там
 * это оправдано: три линейки разного масштаба. Здесь же шесть равнозначных
 * сценариев — читатель ищет среди них свой, а не сравнивает их между собой.
 * Для поиска глазами сетка быстрее списка: шесть коротких заголовков
 * охватываются одним взглядом.
 *
 * Ячейки разделены волосяной линией (gap-px на фоне цвета линии), а не
 * скруглёнными карточками с тенями: рамка вокруг каждого сценария добавила бы
 * шесть лишних контуров и ни одного смысла.
 */
export function AudienceSection() {
	return (
		<Section id="audience" tone="void" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<Reveal>
					<SectionHeading
						title={audience.title}
						intro={audience.intro}
						className="mb-[clamp(2.5rem,5vw,4rem)]"
					/>
				</Reveal>

				<div className="grid gap-px overflow-hidden rounded-[var(--radius-md)] bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-3">
					{audience.scenarios.map((scenario, index) => (
						<Reveal
							key={scenario.id}
							delay={(index % 3) * 70 + Math.floor(index / 3) * 90}
							className="flex"
						>
							<div className="group flex w-full flex-col gap-4 bg-[var(--void)] p-[clamp(1.25rem,2.2vw,1.875rem)] transition-colors duration-500 hover:bg-[var(--surface)]">
								<div className="flex flex-col gap-2">
									<h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--primary)]">
										{scenario.title}
									</h3>
									<p className="text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
										{scenario.lead}
									</p>
								</div>

								{/*
								  Объекты защиты — перечисление через тонкие
								  разделители, а не маркированный список с
								  галочками. Галочка означает «преимущество,
								  которое вы получаете»; здесь же это просто
								  перечень того, что стоит на участке, и
								  притворяться списком выгод ему незачем.

								  Разделитель — псевдоэлемент ПОСЛЕ пункта, а не
								  отдельный узел перед ним: отдельный узел при
								  переносе строки уезжает вниз первым, и новая
								  строка начиналась с висящей точки («· Пасека»).
								  Псевдоэлемент — часть пункта и переносится
								  вместе с ним.
								*/}
								<ul className="mt-auto flex list-none flex-wrap items-center gap-x-2 gap-y-1.5 p-0 pt-1">
									{scenario.objects.map((object) => (
										<li
											key={object}
											className="flex items-center text-[0.8125rem] text-[var(--text-muted)] after:ml-2 after:text-[var(--border)] after:content-['·'] last:after:content-none"
										>
											{object}
										</li>
									))}
								</ul>
							</div>
						</Reveal>
					))}
				</div>

				{/* ── Условия покупки ─────────────────────────────────────────
				    Одинаковые для всех — ради этого утверждения раздел и
				    перестал быть противопоставлением двух колонок. */}
				<Reveal delay={120} className="mt-[clamp(2rem,4vw,3rem)]">
					<div className="flex flex-col gap-6 border-t border-[var(--rule)] pt-[clamp(1.5rem,3vw,2.5rem)] lg:flex-row lg:items-start lg:justify-between lg:gap-12">
						<div className="flex max-w-[62ch] flex-col gap-3">
							<h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
								{audience.terms.title}
							</h3>
							<p className="text-[0.9375rem] leading-[1.7] text-[var(--text-secondary)]">
								{audience.terms.body}
							</p>
							{/* Дилерская скидка — единственное реальное отличие в
							    условиях, поэтому она выделена, а не спрятана в
							    общий абзац. Без цифр: их называет менеджер. */}
							<p className="inline-flex w-fit items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-3.5 py-2 text-[0.875rem] text-[var(--text-primary)]">
								<span
									aria-hidden="true"
									className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]"
								/>
								{audience.terms.dealer}
							</p>
						</div>

						<div className="flex shrink-0 flex-wrap items-center gap-3">
							<Link
								href={audience.terms.primaryCta.href}
								className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--primary)] px-6 py-3.5 text-[0.9375rem] font-semibold text-white no-underline transition-colors duration-200 hover:bg-[var(--primary-600)]"
							>
								{audience.terms.primaryCta.label}
								<ArrowRight
									className="size-4 transition-transform duration-200 group-hover:translate-x-1"
									aria-hidden="true"
								/>
							</Link>
							<Link
								href={audience.terms.secondaryCta.href}
								className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-6 py-3.5 text-[0.9375rem] font-medium text-[var(--text-primary)] no-underline transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[var(--surface)]"
							>
								{audience.terms.secondaryCta.label}
								<ArrowUpRight
									className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</Link>
						</div>
					</div>
				</Reveal>
			</Container>
		</Section>
	);
}
