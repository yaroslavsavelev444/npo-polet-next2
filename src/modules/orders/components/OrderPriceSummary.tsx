import { formatPrice } from "@/modules/productCard";
import { PAYMENT_STATUS_LABELS } from "../lib/labels";
import type { OrderDetailView } from "../types";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

type PaymentStatus = OrderDetailView["payment"]["status"];

interface OrderPriceSummaryProps {
	subtotal: number;
	discount: number;
	total: number;
	/** Стоимость доставки — строка показывается только если > 0. */
	shippingCost?: number;
	/** Статус оплаты — бейдж рядом с итогом (только в просмотре заказа). */
	paymentStatus?: PaymentStatus;
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
	pending: "bg-[var(--warning)]/15 text-[var(--warning)]",
	paid: "bg-[var(--success)]/15 text-[var(--success)]",
	failed: "bg-[var(--error)]/15 text-[var(--error)]",
	refunded: "bg-[var(--error)]/15 text-[var(--error)]",
};

/**
 * Итоговая стоимость заказа. Строка скидки показывается только при её наличии
 * (промокодов в заказе нет — только скидки на товары, уже учтённые в позициях).
 * Строки доставки и статуса оплаты опциональны — используются в просмотре заказа.
 */
export function OrderPriceSummary({
	subtotal,
	discount,
	total,
	shippingCost = 0,
	paymentStatus,
}: OrderPriceSummaryProps) {
	const hasDiscount = discount > 0;
	const hasShipping = shippingCost > 0;

	return (
		<section className={`p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
				Стоимость
			</h3>

			<dl className="flex flex-col gap-2.5 text-sm">
				<div className="flex items-baseline justify-between gap-3">
					<dt className="text-[var(--text-secondary)]">Сумма товаров</dt>
					<dd className="tabular-nums text-[var(--text-primary)]">
						{formatPrice(subtotal)}
					</dd>
				</div>

				{hasDiscount && (
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-[var(--success)]">Скидка</dt>
						<dd className="tabular-nums text-[var(--success)]">
							−{formatPrice(discount)}
						</dd>
					</div>
				)}

				{hasShipping && (
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-[var(--text-secondary)]">Доставка</dt>
						<dd className="tabular-nums text-[var(--text-primary)]">
							{formatPrice(shippingCost)}
						</dd>
					</div>
				)}

				<div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--border-light)] pt-3.5">
					<dt className="flex flex-wrap items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
						К оплате
						{paymentStatus && (
							<span
								className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PAYMENT_STATUS_STYLES[paymentStatus]}`}
							>
								{PAYMENT_STATUS_LABELS[paymentStatus]}
							</span>
						)}
					</dt>
					<dd className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
						{formatPrice(total)}
					</dd>
				</div>
			</dl>
		</section>
	);
}
