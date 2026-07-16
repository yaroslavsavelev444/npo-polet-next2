import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import type { OrderLineItem } from "../lib/order-line-item";
import { OrderProductCard } from "./OrderProductCard";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderProductListProps {
	items: OrderLineItem[];
}

function pluralizeItems(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "товар";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "товара";
	return "товаров";
}

/** Блок купленных товаров: список позиций + сумма по позициям. */
export function OrderProductList({ items }: OrderProductListProps) {
	const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

	return (
		<section className={`overflow-hidden ${ORDER_CARD_CLASS}`}>
			<header className="flex items-center gap-2.5 border-b border-[var(--border-light)] px-4 py-3.5 sm:px-5">
				<ShoppingBag
					size={16}
					className="text-[var(--text-secondary)]"
					aria-hidden
				/>
				<h2 className="text-sm font-semibold text-[var(--text-primary)]">
					Товары
				</h2>
				<span className="text-sm text-[var(--text-secondary)]">
					{items.length} {pluralizeItems(items.length)}
				</span>
			</header>

			<div className="flex flex-col divide-y divide-[var(--border)] p-1.5 sm:p-2">
				{items.map((item) => (
					<OrderProductCard key={item.key} item={item} />
				))}
			</div>

			<footer className="flex items-center justify-between border-t border-[var(--border-light)] px-4 py-3.5 sm:px-5">
				<span className="text-sm text-[var(--text-secondary)]">
					Сумма позиций
				</span>
				<span className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
					{formatPrice(itemsTotal)}
				</span>
			</footer>
		</section>
	);
}
