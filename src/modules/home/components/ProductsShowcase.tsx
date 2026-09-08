import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/modules/productCard";
import type { ProductCardData } from "@/modules/productCard/types";
import { Reveal } from "@/shared/components/motion/Reveal";
import { Empty } from "@/UI";
import { products as copy } from "../content/home-content";
import { Container, Section } from "./primitives";

/**
 * Подборка товаров на главной — цель всей страницы.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * РОВНО ДВА РЯДА НА ЛЮБОЙ ШИРИНЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Число колонок в каталоге зависит от ширины (2/3/4/5), поэтому одно
 * фиксированное количество товаров дало бы то два ряда, то три с половиной —
 * а «половина ряда» на главной читается как обрыв, а не как «дальше есть
 * ещё».
 *
 * Решение: с сервера приходит максимум (10 штук), а лишние прячутся правилом
 * nth-child под каждую раскладку. Никакого JS и никакого измерения ширины —
 * значит, и никакого мелькания при загрузке.
 *
 * Единственное исключение — самый узкий экран: там два ряда это всего четыре
 * карточки, что выглядит как случайный обрезок каталога. На нём показываются
 * три ряда: строки в две колонки низкие, и блок по высоте выходит сопоставимым
 * с двумя рядами на десктопе.
 *
 * Карточка используется каталожная, без единой правки: корзина, избранное,
 * счётчик количества и разметка товара для поиска приходят с ней вместе.
 * Дублировать её ради другого вида появления было бы худшим решением из
 * возможных — две карточки разъедутся при первой же правке каталога.
 */

// Раскладка повторяет каталог (modules/productCard/productGrid), чтобы карточка
// на главной и в каталоге имела одинаковую ширину.
//
// Класс @container обязан быть на ОБЁРТКЕ, а не на самой сетке: элемент не
// может быть собственным query-контейнером, и при совмещении ролей запросы
// молча перестают срабатывать (сетка навсегда остаётся двухколоночной). Тот же
// подводный камень описан в modules/productCard/productGrid.tsx.
const GRID = [
	"grid grid-cols-2 gap-3",
	"@[38rem]:grid-cols-3 @[38rem]:gap-4",
	"@[52rem]:grid-cols-4",
	"@[72rem]:grid-cols-5 @[72rem]:gap-5",
	// Отсечка лишних карточек до ровных двух рядов — см. .home-two-rows
	// в app/(frontend)/home.css.
	"home-two-rows",
].join(" ");

export function ProductsShowcase({
	products,
}: {
	products: ProductCardData[];
}) {
	const visible = products.slice(0, 10);

	return (
		<Section id="products" tone="void" className="py-[clamp(4.5rem,9vw,9rem)]">
			<Container wide>
				<Reveal>
					<div className="mb-[clamp(2rem,4vw,3.25rem)] flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
						<div className="flex flex-col gap-3">
							<h2 className="text-[clamp(1.75rem,1.1rem+2.6vw,3.25rem)] font-bold tracking-[-0.025em] text-[var(--text-primary)]">
								{copy.title}
							</h2>
							<p className="max-w-[46ch] text-[clamp(0.9375rem,0.88rem+0.25vw,1.0625rem)] text-[var(--text-secondary)]">
								{copy.subtitle}
							</p>
						</div>

						{/* Дубль основного действия сверху: на широком экране
						    низ сетки уходит далеко вниз, и ссылка «весь
						    каталог» должна быть под рукой в обоих концах
						    блока. */}
						<Link
							href={copy.cta.href}
							className="group hidden items-center gap-2 self-end text-[0.9375rem] font-medium text-[var(--text-primary)] no-underline sm:inline-flex"
						>
							<span className="border-b border-[var(--rule)] pb-0.5 transition-colors duration-200 group-hover:border-[var(--primary)]">
								{copy.cta.label}
							</span>
							<ArrowRight
								className="size-4 transition-transform duration-200 group-hover:translate-x-1"
								aria-hidden="true"
							/>
						</Link>
					</div>
				</Reveal>

				{visible.length === 0 ? (
					<Empty message={copy.emptyMessage} className="py-14" />
				) : (
					<div className="@container">
						<div className={GRID}>
							{visible.map((product, index) => (
								<Reveal
									key={product.id}
									variant="soft"
									// Каскад идёт по позиции в ряду, а не по
									// сквозному индексу: иначе на широком экране
									// десятая карточка появляется почти на
									// секунду позже первой, и ряд собирается
									// «лесенкой» вместо волны.
									delay={(index % 5) * 60 + Math.floor(index / 5) * 90}
									className="h-full"
								>
									<ProductCard product={product} priorityImage={index < 5} />
								</Reveal>
							))}
						</div>
					</div>
				)}

				<Reveal delay={120}>
					<div className="mt-[clamp(2rem,4vw,3rem)] flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-[var(--rule)] pt-6">
						<Link
							href={copy.cta.href}
							className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] px-6 py-3.5 text-[0.9375rem] font-semibold text-[var(--text-primary)] no-underline transition-colors duration-200 hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
						>
							{copy.cta.label}
							<ArrowRight
								className="size-4 transition-transform duration-200 group-hover:translate-x-1"
								aria-hidden="true"
							/>
						</Link>

						<p className="text-[0.875rem] text-[var(--text-muted)]">
							{copy.secondaryNote}{" "}
							<Link
								href={copy.secondaryCta.href}
								className="text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition-colors duration-200 hover:text-[var(--accent-hover)] hover:decoration-current"
							>
								{copy.secondaryCta.label}
							</Link>
						</p>
					</div>
				</Reveal>
			</Container>
		</Section>
	);
}
