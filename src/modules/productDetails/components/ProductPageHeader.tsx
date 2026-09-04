import { PRODUCT_STATUS_LABELS } from "@/modules/productCard";
import { cn } from "@/utils/cn";
import type { ProductDetailData } from "../types";
import { ProductRatingLink } from "./ProductRatingLink";

interface ProductPageHeaderProps {
	product: ProductDetailData;
	rating: { average: number; count: number };
}

const STATUS_DOT: Record<ProductDetailData["status"], string> = {
	available: "bg-[var(--success)]",
	preorder: "bg-[var(--warning)]",
	out_of_stock: "bg-[var(--border-light)]",
	discontinued: "bg-[var(--border-light)]",
};

/**
 * Шапка страницы товара: название во всю ширину контента и строка фактов
 * под ним.
 *
 * Название раньше стояло внутри 380-пиксельной колонки покупки. Длинное
 * техническое имя — а в этом каталоге они длинные — превращалось там в
 * восьмистрочный блок, который занимал весь первый экран и уводил кнопку
 * покупки под сгиб. Здесь у названия вся ширина страницы и ограничение по
 * мере строки, поэтому и короткое, и стосимвольное название дают одинаково
 * спокойный первый экран.
 */
export function ProductPageHeader({ product, rating }: ProductPageHeaderProps) {
	return (
		<header>
			{/*
			 * Названия в этом каталоге техничные и длинные — «Стационарная
			 * многоканальная установка … с выносными антеннами 40 м» это 140
			 * знаков. На маркетинговом кегле 40 px такое имя занимало восемь
			 * строк и съедало первый экран целиком. Кегль ниже, а мера строки
			 * шире: короткое название остаётся уверенным заголовком, длинное
			 * укладывается в три-четыре строки.
			 */}
			<h1 className="max-w-[40ch] text-balance text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px] lg:text-[30px]">
				{product.title}
			</h1>

			<div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
				<span className="flex items-center gap-2 text-[var(--text-secondary)]">
					<span
						className={cn(
							"h-1.5 w-1.5 rounded-full",
							STATUS_DOT[product.status],
						)}
						aria-hidden="true"
					/>
					{PRODUCT_STATUS_LABELS[product.status]}
				</span>

				<ProductRatingLink average={rating.average} count={rating.count} />

				{product.brand.manufacturer && (
					<span className="text-[var(--text-muted)]">
						{product.brand.manufacturer}
					</span>
				)}
			</div>
		</header>
	);
}
