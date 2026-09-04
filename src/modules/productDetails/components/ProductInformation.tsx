import { ReviewsSection, type ReviewsSectionData } from "@/modules/reviews";
import { cn } from "@/utils/cn";
import { PRODUCT_REVIEWS_ANCHOR_ID } from "../lib/reviews-anchor";
import type { ProductDetailData } from "../types";
import { buildSpecGroups, ProductSpecs } from "./ProductSpecs";

interface Props {
	product: ProductDetailData;
	reviewsData: ReviewsSectionData;
	className?: string;
}

/**
 * Информационная часть страницы товара: описание, характеристики, отзывы.
 *
 * Раньше это были вкладки. Вкладки прятали характеристики и отзывы за клик,
 * не попадали в поиск по странице (Ctrl+F не находит того, чего нет в DOM) и
 * требовали клиентского состояния, чтобы ссылка на рейтинг умела их
 * открывать. На странице товара нечего скрывать: описание и характеристики —
 * ровно то, за чем сюда приходят. Теперь это обычный поток секций, который
 * читается сверху вниз и целиком индексируется.
 *
 * Вертикальный ритм принадлежит секции, а не промежутку между секциями:
 * каждая несёт свой отступ и разделительную линию, а `first:` их снимает.
 * Поэтому товар без описания или без характеристик не оставляет после себя ни
 * лишнего отступа, ни висящей линии — то самое «у разных товаров разные
 * отступы», из-за которого страница выглядела по-разному от товара к товару.
 */
const SECTION_CLASSNAME =
	"mt-[3rem] border-t border-[var(--hairline)] pt-10 first:mt-0 first:border-t-0 first:pt-0";

const HEADING_CLASSNAME =
	"text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl";

export function ProductInformation({ product, reviewsData, className }: Props) {
	const description = product.description?.trim();
	const specGroups = buildSpecGroups(product);

	return (
		<div className={cn("flex flex-col", className)}>
			{description && (
				<section
					className={SECTION_CLASSNAME}
					aria-labelledby="product-description-heading"
				>
					<h2 id="product-description-heading" className={HEADING_CLASSNAME}>
						Описание
					</h2>
					{/* Мера строки ограничена явно: описание живёт в широкой колонке,
					    и без ограничения строка растягивалась бы за пределы того, что
					    глаз удерживает без потери места. */}
					<div className="mt-[1rem] max-w-[68ch] whitespace-pre-line text-[15px] leading-[1.75] text-[var(--text-secondary)]">
						{description}
					</div>
				</section>
			)}

			{specGroups.length > 0 && (
				<section
					className={SECTION_CLASSNAME}
					aria-labelledby="product-specs-heading"
				>
					<h2 id="product-specs-heading" className={HEADING_CLASSNAME}>
						Характеристики
					</h2>
					<div className="mt-6">
						<ProductSpecs groups={specGroups} />
					</div>
				</section>
			)}

			<section
				id={PRODUCT_REVIEWS_ANCHOR_ID}
				className={cn(
					SECTION_CLASSNAME,
					"scroll-mt-[calc(var(--sticky-header-height)+2rem)]",
				)}
				aria-labelledby="product-reviews-heading"
			>
				<h2
					id="product-reviews-heading"
					className={cn(HEADING_CLASSNAME, "mb-6")}
				>
					Отзывы
					{reviewsData.breakdown.count > 0 && (
						<span className="ml-[0.5rem] font-normal tabular-nums text-[var(--text-muted)]">
							{reviewsData.breakdown.count}
						</span>
					)}
				</h2>
				<ReviewsSection data={reviewsData} />
			</section>
		</div>
	);
}
