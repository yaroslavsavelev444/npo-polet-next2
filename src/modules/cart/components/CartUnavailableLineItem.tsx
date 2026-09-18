"use client";

import { ImageOff, PackageX, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice, getProductHref } from "@/modules/productCard";
import type { CartItemOperation } from "../store/cart-panel.store";
import type { CartUnavailableItem } from "../types";
import styles from "./Cart.module.css";

interface Props {
	item: CartUnavailableItem;
	operation?: CartItemOperation;
	/** Порядковый номер для каскада появления — общий с доступными строками. */
	index: number;
	onRemove: () => void;
	onNavigate?: () => void;
}

/**
 * Строка товара, который больше нельзя заказать.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОНА ВООБЩЕ ЕСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Молча выбросить позицию нельзя: человек её выбирал, и пропажа читается как
 * сбой приложения, а не как «товар сняли с продажи». Поэтому строка остаётся
 * ровно там же, где стояла, — но выглядит однозначно неактивной.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧЕМ ОНА ОТЛИЧАЕТСЯ ОТ ОБЫЧНОЙ
 * ────────────────────────────────────────────────────────────────────────────
 *  • нет счётчика количества: менять количество у того, что нельзя заказать,
 *    бессмысленно — показывается просто «N шт.»;
 *  • нет суммы: позиция не участвует в расчёте, и цифра рядом с ней читалась
 *    бы как часть итога;
 *  • есть причина словами («Нет в наличии», «Снят с производства»): «просто
 *    недоступен» не даёт понять, ждать товар или искать замену;
 *  • крестик удаления работает как у обычной строки — это единственное
 *    действие, которое здесь имеет смысл.
 *
 * Пометка НЕ закрывается. Закрыть можно только полосу-уведомление сверху
 * (см. CartUnavailableNotice); состояние самой позиции обязано быть видно
 * столько, сколько она в корзине лежит.
 */
export function CartUnavailableLineItem({
	item,
	operation,
	index,
	onRemove,
	onNavigate,
}: Props) {
	const { product } = item;
	const image = product?.images[0];
	const isRemoving = operation === "removing";
	const isBusy = operation === "updating";

	// Товара в базе нет вовсе — ни ссылки, ни кадра, ни названия. Показываем
	// честную заглушку вместо ссылки в никуда.
	const href = product ? getProductHref(product) : null;
	const title = item.title ?? "Товар удалён из каталога";

	return (
		<li
			className={styles.row}
			data-removing={isRemoving || undefined}
			style={{ "--i": index } as React.CSSProperties}
		>
			<div className={styles.reveal}>
				<div
					className={styles.item}
					data-unavailable="true"
					data-busy={isBusy || undefined}
				>
					{href ? (
						<Link
							href={href}
							className={styles.thumb}
							onClick={onNavigate}
							tabIndex={-1}
							aria-hidden="true"
						>
							<Thumb url={image?.url} />
						</Link>
					) : (
						<span className={styles.thumb} aria-hidden="true">
							<Thumb url={image?.url} />
						</span>
					)}

					<div className={styles.itemMain}>
						<div className={styles.itemHead}>
							{href ? (
								<Link
									href={href}
									className={styles.itemTitle}
									onClick={onNavigate}
								>
									{title}
								</Link>
							) : (
								<span className={styles.itemTitle}>{title}</span>
							)}

							<button
								type="button"
								className={styles.remove}
								onClick={onRemove}
								disabled={isBusy || isRemoving}
								aria-label={`Убрать «${title}» из корзины`}
							>
								<X size={15} aria-hidden />
							</button>
						</div>

						{/* role="status" не нужен: строка присутствует с самого
						    открытия корзины, а не появляется в ответ на действие.
						    Скринридер прочитает её при обходе списка. */}
						<p className={styles.unavailableTag}>
							<PackageX size={13} aria-hidden />
							<span>Недоступен для заказа — {item.statusLabel}</span>
						</p>

						<p className={styles.itemMeta}>
							<span>{item.quantity} шт. в корзине</span>
							{product && (
								<span>{formatPrice(product.priceForIndividual)} / шт.</span>
							)}
						</p>
					</div>
				</div>
			</div>
		</li>
	);
}

function Thumb({ url }: { url?: string }) {
	if (!url) {
		return (
			<span className={styles.thumbEmpty}>
				<ImageOff size={18} aria-hidden />
			</span>
		);
	}
	return (
		<Image src={url} alt="" fill sizes="72px" className={styles.thumbImage} />
	);
}
