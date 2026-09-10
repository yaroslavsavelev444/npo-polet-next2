"use client";

import { ArrowRight, Loader2, LogIn } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import type { CartView } from "../types";
import styles from "./Cart.module.css";

interface Props {
	summary: CartView["summary"];
	isValid: boolean;
	/** Идёт запись — итог показан по прошлым данным. */
	isStale: boolean;
	isGuest: boolean;
	isCheckingOut: boolean;
	onCheckout: () => void;
	onClear?: () => void;
	onContinue?: () => void;
}

/**
 * Нижняя часть панели: сколько выходит и что делать дальше.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СОСТАВ СТРОК
 * ────────────────────────────────────────────────────────────────────────────
 * Показываются только те величины, которые реально считает бизнес-логика:
 * стоимость товаров без скидок, скидка (одной строкой — товарные скидки и
 * скидка корзины неразделимы для покупателя) и итог. Строки «доставка» здесь
 * НЕТ намеренно: стоимость доставки в этом проекте определяется способом,
 * который выбирают на оформлении, и показать её в корзине можно было бы
 * только выдумав. Вместо цифры, которой нет, — честная подпись под кнопкой.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ТЕКСТ КНОПКИ
 * ────────────────────────────────────────────────────────────────────────────
 * «Оформить заказ», а не «Перейти к оформлению»: называется результат, а не
 * маршрут. Гостю — «Войти и оформить»: следующий шаг всё равно требует
 * аккаунта, и узнать об этом на кнопке лучше, чем после нажатия.
 */
export function CartSummary({
	summary,
	isValid,
	isStale,
	isGuest,
	isCheckingOut,
	onCheckout,
	onClear,
	onContinue,
}: Props) {
	const hasDiscount = summary.totalDiscount > 0;
	const blocked = !isValid;

	return (
		<footer className={styles.footer}>
			<div className={styles.totals} data-stale={isStale || undefined}>
				<p className={styles.totalsRow}>
					<span>Товары ({summary.totalItems} шт.)</span>
					<span className={styles.totalsValue}>
						{formatPrice(summary.priceWithoutDiscount)}
					</span>
				</p>

				{hasDiscount && (
					<p className={styles.totalsRow} data-tone="discount">
						<span>
							Скидка
							{summary.centralDiscountPercent > 0
								? ` ${summary.centralDiscountPercent}%`
								: ""}
						</span>
						<span className={styles.totalsValue}>
							−{formatPrice(summary.totalDiscount)}
						</span>
					</p>
				)}

				<p className={styles.totalsGrand}>
					<span className={styles.totalsGrandLabel}>Итого</span>
					<span className={styles.totalsGrandValue}>
						{formatPrice(summary.totalPrice)}
					</span>
				</p>
			</div>

			<button
				type="button"
				className={styles.cta}
				onClick={onCheckout}
				disabled={blocked || isCheckingOut}
				aria-describedby="cart-cta-note"
			>
				{isCheckingOut ? (
					<Loader2 size={16} className="animate-spin" aria-hidden />
				) : isGuest ? (
					<LogIn size={16} aria-hidden />
				) : null}
				{isGuest ? "Войти и оформить" : "Оформить заказ"}
				{!isCheckingOut && !isGuest && (
					<ArrowRight size={16} className={styles.ctaArrow} aria-hidden />
				)}
			</button>

			<p
				id="cart-cta-note"
				className={`${styles.ctaNote} ${blocked ? styles.ctaNoteBlocked : ""}`}
			>
				{blocked
					? "Доведите количество до минимальной партии — тогда заказ можно будет оформить"
					: isGuest
						? "Товары сохранятся: после входа корзина останется той же"
						: "Способ доставки и оплаты выбираются на следующем шаге"}
			</p>

			{(onClear || onContinue) && (
				<div className={styles.secondaryRow}>
					{onContinue && (
						<button
							type="button"
							className={styles.secondaryLink}
							onClick={onContinue}
						>
							Продолжить покупки
						</button>
					)}
					{onClear && (
						<button
							type="button"
							className={styles.secondaryLink}
							onClick={onClear}
						>
							Очистить корзину
						</button>
					)}
				</div>
			)}
		</footer>
	);
}
