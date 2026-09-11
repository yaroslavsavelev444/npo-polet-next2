import type { ReactNode } from "react";
import { DrawnRule } from "@/shared/components/motion/DrawnRule";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import styles from "./ProductPage.module.css";

interface ProductSectionProps {
	id?: string;
	title: string;
	/** Приписка справа от названия: число отзывов, число позиций. */
	note?: ReactNode;
	children: ReactNode;
	className?: string;
}

/**
 * Раздел страницы товара: линия → название → содержимое.
 *
 * Один ритм на все разделы — описание, характеристики, отзывы, похожие
 * товары. Разделитель приходит не проявлением, а прочерком слева направо
 * (DrawnRule): на линии высотой в пиксель общее для сайта появление
 * «наводкой на резкость» не читается вовсе, а линия здесь несёт структурную
 * нагрузку — именно ею отбиты разделы.
 *
 * Название набрано акцидентной PaluiSP2 — единственное место страницы, где
 * она появляется (разбор в шапке ProductPageHeader). Слова разделов короткие
 * и в верхнем регистре, то есть ровно то, на что эта гарнитура рассчитана.
 *
 * Вертикальный отступ принадлежит самому разделу, а не промежутку между
 * разделами: товар без описания или без характеристик не оставляет после себя
 * ни лишней пустоты, ни висящей линии.
 */
export function ProductSection({
	id,
	title,
	note,
	children,
	className,
}: ProductSectionProps) {
	return (
		<section
			id={id}
			className={cn(styles.section, "mt-[clamp(3.5rem,6vw,5.5rem)]", className)}
		>
			<DrawnRule />

			<div className={styles.sectionHead}>
				<Reveal delay={120}>
					<h2 className={cn("u-display", styles.sectionTitle)}>{title}</h2>
				</Reveal>
				{note ? (
					<Reveal delay={200}>
						<span className={cn(styles.micro, styles.sectionNote)}>{note}</span>
					</Reveal>
				) : null}
			</div>

			<Reveal delay={180} className="mt-[clamp(1.5rem,2.5vw,2.5rem)] block">
				{children}
			</Reveal>
		</section>
	);
}
