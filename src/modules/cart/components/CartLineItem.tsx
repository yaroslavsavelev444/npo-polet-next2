"use client";

import { ImageOff, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatPrice, getProductHref } from "@/modules/productCard";
import type { CartItemOperation } from "../store/cart-panel.store";
import type { CartItemView } from "../types";
import styles from "./Cart.module.css";
import { CartQuantityStepper } from "./CartQuantityStepper";

interface Props {
	item: CartItemView;
	operation?: CartItemOperation;
	/** Порядковый номер для каскада появления. */
	index: number;
	onQuantityChange: (quantity: number) => void;
	onRemove: () => void;
	onNavigate?: () => void;
}

/**
 * Строка корзины.
 *
 * Раскладка — две колонки: кадр и всё остальное. Ни рамок, ни карточек:
 * позиции разделены волосяной линией. Корзина — это список, а не витрина, и
 * коробка вокруг каждой строки добавила бы шесть границ там, где хватает
 * одной.
 *
 * Порядок чтения внутри правой колонки задан приоритетом решения: сначала
 * что это (название), потом чем ограничено (партия, статус), и только затем
 * сколько и почём. Цена стоит в одной строке со счётчиком намеренно — они
 * меняются вместе, и глазу не приходится ходить между углами.
 */
export function CartLineItem({
	item,
	operation,
	index,
	onQuantityChange,
	onRemove,
	onNavigate,
}: Props) {
	const { product, subtotal, subtotalWithoutDiscount, itemDiscount } = item;
	const image = product.images[0];
	const href = getProductHref(product);
	const isBusy = operation === "updating";
	const isRemoving = operation === "removing";
	const hasDiscount = itemDiscount > 0;
	const belowMinimum =
		product.minOrderQuantity > 1 && item.quantity < product.minOrderQuantity;

	// Короткая подсветка цены после изменения количества. Считаем именно смену
	// значения, а не факт нажатия: сервер мог отклонить правку, и подтверждать
	// тогда нечего. Первый рендер не подсвечивается — подтверждать нечего и там.
	const [changed, setChanged] = useState(false);
	const previousSubtotal = useRef(subtotal);
	useEffect(() => {
		if (previousSubtotal.current === subtotal) return;
		previousSubtotal.current = subtotal;
		setChanged(true);
		const timeout = setTimeout(() => setChanged(false), 460);
		return () => clearTimeout(timeout);
	}, [subtotal]);

	return (
		// Два класса намеренно на РАЗНЫХ элементах. На одном они конфликтуют:
		// у обоих объявлен `transition` сокращённой записью, и правило каскада
		// с большей специфичностью (.root[data-open] .reveal) полностью
		// заменяет собой переход строки — схлопывание высоты при удалении
		// теряло анимацию и происходило рывком. Снаружи — уход строки,
		// внутри — её появление.
		<li
			className={styles.row}
			data-removing={isRemoving || undefined}
			style={{ "--i": index } as React.CSSProperties}
		>
			<div className={styles.reveal}>
				<div className={styles.item} data-busy={isBusy || undefined}>
					<Link
						href={href}
						className={styles.thumb}
						onClick={onNavigate}
						tabIndex={-1}
						aria-hidden="true"
					>
						{image ? (
							<Image
								src={image.url}
								alt=""
								fill
								sizes="72px"
								className={styles.thumbImage}
							/>
						) : (
							<span className={styles.thumbEmpty}>
								<ImageOff size={18} aria-hidden />
							</span>
						)}
					</Link>

					<div className={styles.itemMain}>
						<div className={styles.itemHead}>
							{/* Кадр выше — копия этой же ссылки, поэтому он скрыт от
							    скринридера и выключен из обхода табом: одна позиция
							    должна давать одну остановку, а не две одинаковые. */}
							<Link
								href={href}
								className={styles.itemTitle}
								onClick={onNavigate}
							>
								{product.title}
							</Link>

							<button
								type="button"
								className={styles.remove}
								onClick={onRemove}
								disabled={isBusy || isRemoving}
								aria-label={`Убрать «${product.title}» из корзины`}
							>
								<X size={15} aria-hidden />
							</button>
						</div>

						<p className={styles.itemMeta}>
							<span>{formatPrice(item.unitFinalPrice)} / шт.</span>
							{product.status === "preorder" && <span>Под заказ</span>}
							{belowMinimum && (
								<span className={styles.itemMetaWarning}>
									Мин. партия {product.minOrderQuantity} шт.
								</span>
							)}
						</p>

						<div className={styles.itemFoot}>
							<CartQuantityStepper
								quantity={item.quantity}
								min={product.minOrderQuantity}
								max={product.maxOrderQuantity}
								disabled={isBusy || isRemoving}
								title={product.title}
								onChange={onQuantityChange}
								onRemove={onRemove}
							/>

							<p className={styles.itemPrice}>
								{hasDiscount && (
									<span className={styles.itemPriceOld}>
										{formatPrice(subtotalWithoutDiscount)}
									</span>
								)}
								<span
									className={styles.itemPriceNow}
									data-changed={changed || undefined}
								>
									{formatPrice(subtotal)}
								</span>
							</p>
						</div>
					</div>
				</div>
			</div>
		</li>
	);
}
