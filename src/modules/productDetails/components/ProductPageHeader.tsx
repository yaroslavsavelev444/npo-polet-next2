import { PRODUCT_STATUS_LABELS } from "@/modules/productCard";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import type { ProductDetailData } from "../types";
import styles from "./ProductPage.module.css";
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
 * Шапка страницы товара: возврат в раздел → название → полка фактов.
 *
 * Название набрано основной гарнитурой, а не акцидентной PaluiSP2, и это
 * осознанный отказ. Имена в этом каталоге техничные и длинные — «Стационарная
 * многоканальная установка … с выносными антеннами 40 м» это 140 знаков, — а
 * у PaluiSP2 знак занимает ~1.2em против ~0.5em у Manrope. Такое имя ею
 * набрать нельзя ни при каком кегле. Акцидентная гарнитура на этой странице
 * работает уровнем ниже, на названиях разделов: там слова короткие и в
 * верхнем регистре. Разделение получается честное — Manrope называет ТОВАР,
 * PaluiSP2 называет ЧАСТИ СТРАНИЦЫ.
 *
 * Полка фактов разлинована сверху и снизу. Это не декоративная черта: на
 * нижней линии стоят обе колонки первого экрана — галерея и блок покупки, — и
 * она физически связывает шапку с тем, что под ней.
 *
 * Отдельной ссылки «назад в раздел» здесь нет намеренно. Она тут была, и на
 * узком экране получался дубль в пять пикселей высотой: хлебные крошки на
 * мобильном сворачиваются ровно до одного звена — родительского раздела,
 * поданного как ссылка «назад», — и вторая такая же строка сразу под ней
 * повторяла её слово в слово.
 */
export function ProductPageHeader({ product, rating }: ProductPageHeaderProps) {
	const { brand } = product;

	return (
		<header>
			<Reveal variant="line" className="block">
				<h1 className={styles.title}>{product.title}</h1>
			</Reveal>

			<Reveal delay={200} className="mt-6 block sm:mt-8">
				<div className={styles.factBar}>
					<span className={styles.fact}>
						<span
							className={cn(styles.factDot, STATUS_DOT[product.status])}
							aria-hidden="true"
						/>
						{PRODUCT_STATUS_LABELS[product.status]}
					</span>

					<span aria-hidden className={styles.factDivider} />

					<ProductRatingLink average={rating.average} count={rating.count} />

					{brand.manufacturer && (
						<>
							<span aria-hidden className={styles.factDivider} />
							<span className={styles.fact}>
								<span className={styles.micro}>Производитель</span>
								{brand.manufacturer}
							</span>
						</>
					)}

					{brand.warrantyMonths ? (
						<>
							<span aria-hidden className={styles.factDivider} />
							<span className={styles.fact}>
								<span className={styles.micro}>Гарантия</span>
								<span className="tabular-nums">
									{brand.warrantyMonths} мес.
								</span>
							</span>
						</>
					) : null}
				</div>
			</Reveal>
		</header>
	);
}
