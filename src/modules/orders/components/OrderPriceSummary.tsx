import { formatPrice } from "@/modules/productCard";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderPriceSummaryProps {
	subtotal: number;
	discount: number;
	total: number;
}

/**
 * Итоговая стоимость заказа. Строка скидки показывается только при её наличии
 * (промокодов в заказе нет — только скидки на товары, уже учтённые в позициях).
 */
export function OrderPriceSummary({
	subtotal,
	discount,
	total,
}: OrderPriceSummaryProps) {
	const hasDiscount = discount > 0;

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

				<div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-[var(--border-light)] pt-3.5">
					<dt className="text-base font-semibold text-[var(--text-primary)]">
						К оплате
					</dt>
					<dd className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
						{formatPrice(total)}
					</dd>
				</div>
			</dl>
		</section>
	);
}
