import { Receipt } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import { PAYMENT_STATUS_LABELS } from "../lib/labels";
import type { OrderDetailView } from "../types";
import styles from "./Orders.module.css";

type PaymentStatus = OrderDetailView["payment"]["status"];

interface OrderPriceSummaryProps {
	subtotal: number;
	discount: number;
	total: number;
	/** Стоимость доставки — строка показывается только если > 0. */
	shippingCost?: number;
	/**
	 * Промокод заказа. Его сумма уже входит в `discount`, поэтому строка
	 * «Скидка» показывает остаток — иначе одна и та же уступка была бы
	 * посчитана в итоге дважды.
	 */
	promo?: { code: string; amount: number } | null;
	/** Статус оплаты — подпись рядом с итогом. */
	paymentStatus?: PaymentStatus;
}

const PAYMENT_STATUS_CLASS: Record<PaymentStatus, string> = {
	pending: styles.statusWait,
	paid: styles.statusDone,
	failed: styles.statusStopped,
	refunded: styles.statusStopped,
};

/**
 * Стоимость заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ВАЖНО И ПОЧЕМУ ИМЕННО ТАК
 * ────────────────────────────────────────────────────────────────────────────
 * Блок отвечает на один вопрос: откуда взялась итоговая сумма. Поэтому все
 * слагаемые набраны одним кеглем и одним весом — ни одно из них не важнее
 * другого, — а итог отбит линией и вдвое крупнее: он единственный, ради чего
 * блок открывают.
 *
 * Скидка по промокоду выделена отдельной строкой с самим кодом: покупатель,
 * применивший код, должен видеть подтверждение, что код сработал, а не
 * безымянную «Скидку», по которой это не проверить. Прочие скидки (товарные и
 * корзинная) остаются одной строкой — они не результат его действия, и
 * разбивать их не на что.
 *
 * Расчёт здесь не производится: все величины приходят снимком из заказа.
 * Единственная арифметика — вычитание промокода из общей скидки, чтобы одна и
 * та же уступка не была показана дважды.
 */
export function OrderPriceSummary({
	subtotal,
	discount,
	total,
	shippingCost = 0,
	paymentStatus,
	promo,
}: OrderPriceSummaryProps) {
	const promoAmount = promo && promo.amount > 0 ? promo.amount : 0;
	// Остаток скидки после вычета промокода. Math.max — страховка от
	// исторического заказа, где снимок цен по какой-то причине не сходится:
	// отрицательная «Скидка» была бы заведомой ерундой на глазах покупателя.
	const otherDiscount = Math.max(0, discount - promoAmount);

	return (
		<section className={styles.block}>
			<div className={styles.blockHead}>
				<h3 className={styles.blockTitle}>
					<Receipt size={13} aria-hidden />
					Стоимость
				</h3>
			</div>

			<dl className={styles.sum}>
				<div className={styles.sumRow}>
					<dt className={styles.sumLabel}>Товары</dt>
					<dd className={styles.sumValue}>{formatPrice(subtotal)}</dd>
				</div>

				{otherDiscount > 0 && (
					<div className={`${styles.sumRow} ${styles.sumDiscount}`}>
						<dt className={styles.sumLabel}>Скидка</dt>
						<dd className={styles.sumValue}>−{formatPrice(otherDiscount)}</dd>
					</div>
				)}

				{promoAmount > 0 && promo && (
					<div className={`${styles.sumRow} ${styles.sumDiscount}`}>
						<dt className={styles.sumLabel}>
							Промокод <span className={styles.sumCode}>{promo.code}</span>
						</dt>
						<dd className={styles.sumValue}>−{formatPrice(promoAmount)}</dd>
					</div>
				)}

				{shippingCost > 0 && (
					<div className={styles.sumRow}>
						<dt className={styles.sumLabel}>Доставка</dt>
						<dd className={styles.sumValue}>{formatPrice(shippingCost)}</dd>
					</div>
				)}

				<div className={styles.sumTotal}>
					<dt className={styles.sumTotalLabel}>
						К оплате
						{paymentStatus && (
							<span
								className={`${styles.status} ${PAYMENT_STATUS_CLASS[paymentStatus]}`}
							>
								{PAYMENT_STATUS_LABELS[paymentStatus]}
							</span>
						)}
					</dt>
					<dd className={styles.sumTotalValue}>{formatPrice(total)}</dd>
				</div>
			</dl>
		</section>
	);
}

export default OrderPriceSummary;
