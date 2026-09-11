import { ImageOff, PackageX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/modules/productCard";
import { cn } from "@/utils/cn";
import type { OrderLineItem } from "../lib/order-line-item";
import styles from "./Orders.module.css";

interface OrderProductCardProps {
	item: OrderLineItem;
}

function discountPercent(original: number, final: number): number {
	if (original <= 0 || final >= original) return 0;
	return Math.round((1 - final / original) * 100);
}

/**
 * Позиция заказа — строка, а не карточка.
 *
 * Причина та же, что у карточки товара в каталоге: десяток обведённых
 * прямоугольников внутри и без того вложенного блока читается решёткой.
 * Строку от строки отбивает волосяная линия, кадр стоит на плашке
 * --media-plate — общей поверхности для всех снимков товаров на сайте.
 *
 * Вся строка — цель перехода (растянутая ссылка): целиться в название не
 * нужно. Недоступный (архивный) товар никуда не ведёт, снимок приглушается,
 * появляется пометка — заказ остаётся целым, даже если товар сняли с продажи.
 *
 * Цена показана дважды и это намеренно: «2 шт. × 31 500 ₽» объясняет, ОТКУДА
 * взялась сумма позиции, а сама сумма справа — сколько это стоило. Без первого
 * покупатель не может проверить расчёт, без второго — сравнить позиции.
 */
export function OrderProductCard({ item }: OrderProductCardProps) {
	const {
		name,
		quantity,
		unitOriginalPrice,
		unitFinalPrice,
		lineTotal,
		hasDiscount,
		imageUrl,
		imageAlt,
		href,
		isArchived,
	} = item;

	const percent = discountPercent(unitOriginalPrice, unitFinalPrice);
	const originalLineTotal = unitOriginalPrice * quantity;
	const isInteractive = Boolean(href) && !isArchived;

	return (
		<li className={styles.item}>
			<div className={styles.itemFrame}>
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt={imageAlt}
						fill
						sizes="60px"
						className={cn(
							styles.itemImage,
							isArchived && styles.itemImageArchived,
						)}
					/>
				) : (
					<div className={styles.itemImageEmpty}>
						<ImageOff size={18} aria-hidden />
					</div>
				)}
			</div>

			<div className={styles.itemBody}>
				{isInteractive && href ? (
					<Link href={href} className={styles.itemLink}>
						<h4 className={styles.itemName}>{name}</h4>
					</Link>
				) : (
					<h4 className={styles.itemName}>{name}</h4>
				)}

				<p className={styles.itemMeta}>
					<span>
						{quantity} шт. × {formatPrice(unitFinalPrice)}
					</span>
					{hasDiscount && (
						<>
							<span className={styles.itemStrike}>
								{formatPrice(unitOriginalPrice)}
							</span>
							{percent > 0 && (
								<span className={styles.itemSale}>−{percent}%</span>
							)}
						</>
					)}
				</p>

				{isArchived && (
					<span className={styles.itemArchived}>
						<PackageX size={13} aria-hidden />
						Товара больше нет в продаже
					</span>
				)}
			</div>

			<div className={styles.itemMoney}>
				{hasDiscount && (
					<span className={styles.itemLineOld}>
						{formatPrice(originalLineTotal)}
					</span>
				)}
				<span className={styles.itemLineTotal}>{formatPrice(lineTotal)}</span>
			</div>
		</li>
	);
}

export default OrderProductCard;
