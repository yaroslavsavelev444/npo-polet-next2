import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/shared/components/motion/Reveal";
import { directions } from "../content/home-content";
import { Container, MediaSlot, Section, SectionHeading } from "./primitives";

/**
 * Направления производства — карта линеек до того, как пользователь увидит
 * сетку товаров.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ПОЛОСЫ, А НЕ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Три одинаковых карточки «иконка + заголовок + текст» — самая частая
 * заготовка корпоративного лендинга, и она уравнивает элементы: три карточки
 * выглядят как три равнозначных пункта меню. Здесь же это три РАЗНЫХ по
 * масштабу решения одной задачи, и полноширинная полоса даёт каждому вес
 * отдельного раздела, а не ячейки в таблице.
 *
 * Плюс практическое: в полосу помещается длинное русское название категории,
 * а в карточку шириной в треть экрана — нет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * НАВЕДЕНИЕ НЕ ОБЯЗАТЕЛЬНО
 * ────────────────────────────────────────────────────────────────────────────
 * Наведение только усиливает то, что и так видно: кадр становится ярче,
 * линия — заметнее. Ни одна ссылка и ни одна строка текста не спрятана за
 * hover, поэтому на телефоне не теряется ничего. Те же состояния включаются
 * от focus-within — раздел полностью проходится с клавиатуры.
 */
export function DirectionsSection() {
	return (
		<Section id="directions" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container>
				<Reveal>
					<SectionHeading
						title={directions.title}
						intro={directions.intro}
						className="mb-[clamp(2.5rem,5vw,4.5rem)]"
					/>
				</Reveal>

				<ul className="flex list-none flex-col p-0">
					{directions.items.map((item, index) => (
						<Reveal
							key={item.id}
							as="li"
							delay={index * 110}
							className="group relative border-t border-[var(--rule)] last:border-b"
						>
							<div className="grid items-center gap-x-[clamp(1.5rem,3vw,3rem)] gap-y-5 py-[clamp(1.75rem,3vw,2.75rem)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_13rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_17rem]">
								{/* Название — акцидентной гарнитурой: два-три
								    слова капслоком это её родной регистр. */}
								<h3 className="u-display text-[clamp(1.25rem,0.8rem+1.3vw,2rem)] text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--primary)] group-focus-within:text-[var(--primary)]">
									<Link
										href={item.links[0].href}
										className="text-inherit no-underline outline-offset-4"
									>
										{item.title}
									</Link>
								</h3>

								<div className="flex flex-col gap-4">
									<p className="max-w-[48ch] text-[0.9375rem] leading-[1.65] text-[var(--text-secondary)]">
										{item.summary}
									</p>

									<ul className="flex list-none flex-wrap gap-2 p-0">
										{item.links.map((link) => (
											<li key={link.href}>
												<Link
													href={link.href}
													className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[0.8125rem] text-[var(--text-secondary)] no-underline transition-colors duration-200 hover:border-[var(--border-light)] hover:text-[var(--text-primary)]"
												>
													{link.label}
													<ArrowRight
														className="size-3 opacity-60"
														aria-hidden="true"
													/>
												</Link>
											</li>
										))}
									</ul>
								</div>

								{/*
								  Кадр направления. Тёмный и приглушённый в
								  покое, полной яркости — при наведении и
								  фокусе. Меняются только opacity и transform,
								  то есть анимация целиком на композиторе.
								*/}
								{/*
									  Кадр 4:3 — ровно та пропорция, к которой
									  приведены файлы (scripts/prepare-home-images.py).
									  Совпадение обязательно: иначе object-cover
									  подрежет уже подрезанное, и у портретного
									  рендера установки снова срежет стволы.
									*/}
								<div className="reticle relative hidden aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-sm)] bg-black md:block">
									<MediaSlot
										imageKey={item.media}
										sizes="(max-width: 1024px) 208px, 272px"
										className="absolute inset-0 h-full w-full"
										imageClassName="scale-[1.03] opacity-75 transition-[transform,opacity] duration-500 [transition-timing-function:var(--ease-out-quart)] group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
									/>
								</div>
							</div>

							{/*
							  Линия, прочерчивающаяся под полосой при наведении.
							  Это указатель «вот эта строка активна», заметный
							  и тогда, когда курсор стоит в стороне от текста.
							*/}
							<span
								aria-hidden="true"
								className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-[var(--primary)] transition-transform duration-500 [transition-timing-function:var(--ease-out-expo)] group-hover:scale-x-100 group-focus-within:scale-x-100"
							/>
						</Reveal>
					))}
				</ul>
			</Container>
		</Section>
	);
}
