import {
	pluralizeReviews,
	ReviewsSection,
	type ReviewsSectionData,
} from "@/modules/reviews";
import { cn } from "@/utils/cn";
import { PRODUCT_REVIEWS_ANCHOR_ID } from "../lib/reviews-anchor";
import type { ProductDetailData } from "../types";
import styles from "./ProductPage.module.css";
import { ProductSection } from "./ProductSection";
import { buildSpecGroups, ProductSpecs, pluralizeSpecs } from "./ProductSpecs";

interface Props {
	product: ProductDetailData;
	reviewsData: ReviewsSectionData;
	className?: string;
}

/**
 * Информационная часть страницы товара: описание, характеристики, отзывы.
 *
 * Разделы идут ВО ВСЮ ШИРИНУ страницы, а не в левой колонке рядом с липким
 * блоком покупки. Раньше было наоборот, и на широком экране правая половина
 * страницы ниже первого экрана оставалась пустой: блок покупки короткий,
 * а под ним до самого подвала — ничего. Теперь первый экран это разворот
 * «галерея + покупка», а всё, что читают, начинается под ним и занимает всю
 * меру. Доступность покупки при этом не пострадала: как только блок уезжает
 * за верхний край, снизу поднимается липкая панель (ProductStickyBar).
 *
 * Вкладок здесь нет и не было: они прятали характеристики и отзывы за клик,
 * не попадали в поиск по странице (Ctrl+F не находит того, чего нет в DOM) и
 * требовали клиентского состояния, чтобы ссылка на рейтинг умела их
 * открывать. На странице товара нечего скрывать — описание и характеристики
 * ровно то, за чем сюда приходят.
 */
export function ProductInformation({ product, reviewsData, className }: Props) {
	const description = product.description?.trim();
	const specGroups = buildSpecGroups(product);
	const specCount = specGroups.reduce(
		(sum, group) => sum + group.items.length,
		0,
	);
	const specsNote = `${specCount} ${pluralizeSpecs(specCount)}`;

	return (
		<div className={cn("flex flex-col", className)}>
			{description && (
				<ProductSection title="Описание">
					<p className={styles.lede}>{description}</p>
				</ProductSection>
			)}

			{specGroups.length > 0 && (
				<ProductSection title="Характеристики" note={specsNote}>
					<ProductSpecs groups={specGroups} />
				</ProductSection>
			)}

			<ProductSection
				id={PRODUCT_REVIEWS_ANCHOR_ID}
				title="Отзывы"
				note={
					reviewsData.breakdown.count > 0
						? `${reviewsData.breakdown.count} ${pluralizeReviews(reviewsData.breakdown.count)}`
						: undefined
				}
			>
				<ReviewsSection data={reviewsData} />
			</ProductSection>
		</div>
	);
}
