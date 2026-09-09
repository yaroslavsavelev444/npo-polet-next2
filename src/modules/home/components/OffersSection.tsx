import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/shared/components/motion/Reveal";
import { offers } from "../content/home-content";
import { Container, Section, SectionHeading } from "./primitives";

/**
 * Скидки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Два условия — это не два «преимущества», которые сравнивают между собой, а
 * две строки прейскуранта: слева условие, справа число. Ровно так их и читают
 * — взглядом по правому краю. Пара одинаковых плиток со скидками заставила бы
 * сравнивать 15% с 10%, хотя выбирать тут нечего: они не альтернативы, а
 * разные основания.
 *
 * Поэтому раздел набран как строки со сквозной линейкой — тем же приёмом
 * «разлиновки», которым на странице устроены шкалы и хронология, а не
 * карточками с рамками.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ФОН ТЕМНЕЕ ОКРУЖЕНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Соседи — «Продукция» (--void) и «Принцип» (фон страницы). Третий, самый
 * тёмный тон (--void-deep) читается как утопленная панель: коммерческое
 * условие не спорит с рассказом о продукте, но и не теряется между двумя
 * длинными разделами. Токен в палитре был, но до сих пор не использовался ни
 * одной секцией — ровно этот регистр он и описывает.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУПНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Разметка — <dl>: условие и его значение связаны семантически, а не только
 * положением в сетке. Скринридер прочитает «Дилерам — 15 процентов», не
 * пытаясь склеить два столбца по вёрстке. Знак процента отделён от числа
 * только визуально: внутри <dd> они стоят подряд, и «15» и «%» читаются
 * слитно.
 */
export function OffersSection() {
	return (
		<Section id="offers" tone="deep" className="py-[clamp(4rem,8vw,7.5rem)]">
			<Container>
				<Reveal>
					<SectionHeading
						title={offers.title}
						className="mb-[clamp(2rem,4vw,3.25rem)]"
					/>
				</Reveal>

				{/* Ширина строки ограничена, хотя колонка секции шире: на широком
				    экране условие и его значение расходились по краям почти на
				    метр, и пара переставала читаться как пара — глазу приходилось
				    возвращаться. Близость и есть та связь, ради которой строка
				    существует. */}
				<dl className="m-0 max-w-[52rem] border-t border-[var(--rule)]">
					{offers.items.map((item, index) => (
						<Reveal
							key={item.id}
							delay={index * 110}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[clamp(1rem,3vw,3rem)] border-b border-[var(--rule)] py-[clamp(1.5rem,3vw,2.75rem)]"
						>
							<dt className="text-[clamp(1.0625rem,0.95rem+0.7vw,1.5rem)] font-medium leading-snug tracking-[-0.01em] text-[var(--text-primary)]">
								{item.condition}
							</dt>

							{/* Число прижато к правому краю: два значения встают в
							    одну колонку, и разницу между ними видно, не читая
							    условий. */}
							<dd className="m-0 flex items-baseline justify-end gap-[0.1em] whitespace-nowrap text-[var(--primary)]">
								<span className="u-display text-[clamp(2.25rem,1.4rem+3.4vw,4.5rem)] leading-[0.85] tabular-nums">
									{item.value}
								</span>
								<span className="text-[clamp(1rem,0.8rem+0.9vw,1.75rem)] font-semibold leading-none">
									{item.unit}
								</span>
							</dd>
						</Reveal>
					))}
				</dl>

				<Reveal delay={260} className="mt-[clamp(1.75rem,3.5vw,2.75rem)]">
					<Link
						href={offers.cta.href}
						className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-6 py-3.5 text-[0.9375rem] font-medium text-[var(--text-primary)] no-underline transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[var(--surface)]"
					>
						{offers.cta.label}
						<ArrowUpRight
							className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</Link>
				</Reveal>
			</Container>
		</Section>
	);
}
