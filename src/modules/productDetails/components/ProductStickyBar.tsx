"use client";

import { useEffect, useState } from "react";
import type { ProductCardData } from "@/modules/productCard";
import { formatPrice } from "@/modules/productCard";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import { PageContainer } from "@/shared/components/PageContainer";
import type { ProductDetailData } from "../types";
import styles from "./ProductPage.module.css";

interface Props {
	product: ProductDetailData;
	cardData: ProductCardData;
	/**
	 * Элемент, за которым панель следит: пока он виден, панели нет. На
	 * странице это сам блок покупки.
	 */
	watchId: string;
}

/**
 * Липкая панель покупки.
 *
 * Раньше она жила только на телефоне: на десктопе блок покупки был липким и
 * ехал вдоль всей страницы. Теперь разделы страницы идут во всю ширину (см.
 * ProductInformation), липкая колонка справа заканчивается вместе с первым
 * экраном — и без этой панели покупателю, дочитавшему характеристики,
 * пришлось бы прокручивать назад. Поэтому панель работает на всех ширинах.
 *
 * Появляется она не «после N пикселей прокрутки», а ровно тогда, когда
 * настоящий блок покупки ушёл из кадра: два одинаковых действия на экране
 * одновременно — это дубль, из-за которого непонятно, какое из них
 * настоящее. Следит за этим IntersectionObserver по элементу блока, а не
 * слушатель прокрутки: наблюдатель не будит страницу на каждом кадре.
 *
 * Степпера в панели нет намеренно. На 390px в строку не помещаются цена в
 * шесть разрядов, степпер и кнопка разом: цена обрезалась на середине, а
 * кнопка сжималась. Панель — короткий путь «добавить»; точное количество
 * задаётся степпером в блоке покупки выше и в корзине. Оба экземпляра
 * работают через один стор корзины и остаются синхронными.
 */
export function ProductStickyBar({ product, cardData, watchId }: Props) {
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const target = document.getElementById(watchId);
		if (!target) {
			// Блока покупки на странице нет — показывать альтернативу ему нечему
			// противопоставить, поэтому панель просто остаётся видимой.
			setShown(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => setShown(!entry.isIntersecting),
			// Нижний отступ равен высоте самой панели: пока блок покупки виден
			// хотя бы краем НАД панелью, дублировать его незачем.
			{ rootMargin: "0px 0px -80px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [watchId]);

	return (
		<div
			data-shown={shown || undefined}
			// Панель остаётся в разметке скрытой, иначе оборвётся анимация ухода.
			// Но «присутствует» и «доступна» — разные вещи: inert убирает её из
			// обхода табом и из дерева доступности, пока она не показана.
			inert={!shown}
			className={styles.stickyBar}
		>
			<PageContainer className={styles.stickyInner}>
				<span className={styles.stickyTitle}>{product.title}</span>

				<span className={styles.stickyPrice}>
					<span className={styles.stickyPriceValue}>
						{formatPrice(product.finalPrice)}
					</span>
					{product.hasDiscount && (
						<span className={styles.stickyPriceOld}>
							{formatPrice(product.priceForIndividual)}
						</span>
					)}
				</span>

				<span className={styles.stickyAction}>
					<ProductQuantitySelector
						variant="card"
						product={cardData}
						minOrderQuantity={product.minOrderQuantity}
						maxOrderQuantity={product.maxOrderQuantity}
					/>
				</span>
			</PageContainer>
		</div>
	);
}
