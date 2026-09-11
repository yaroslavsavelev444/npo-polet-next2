import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import type { OrderLineItem } from "../lib/order-line-item";
import { OrderProductCard } from "./OrderProductCard";
import styles from "./Orders.module.css";

interface OrderProductListProps {
	items: OrderLineItem[];
}

function pluralizeItems(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "позиция";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "позиции";
	return "позиций";
}

function pluralizeUnits(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "единица";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "единицы";
	return "единиц";
}

/**
 * Состав заказа: позиции и сумма по ним.
 *
 * В шапке блока стоят обе величины — число позиций и общее количество единиц.
 * Они разные и обе нужны: «3 позиции» отвечает, сколько разных товаров, «7
 * единиц» — сколько коробок приедет. Раньше в списке показывалось только
 * второе, и заказ из одной позиции по семь штук выглядел как заказ из семи
 * разных товаров.
 *
 * Сумма позиций в подвале — не дубль итога: она НЕ включает доставку и
 * корзинные скидки, и именно по ней сверяют расчёт в блоке стоимости.
 */
export function OrderProductList({ items }: OrderProductListProps) {
	const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
	const units = items.reduce((sum, item) => sum + item.quantity, 0);

	return (
		<section className={styles.block}>
			<div className={styles.blockHead}>
				<h3 className={styles.blockTitle}>
					<ShoppingBag size={13} aria-hidden />
					Состав заказа
				</h3>
				<p className={styles.blockNote}>
					{items.length} {pluralizeItems(items.length)} · {units}{" "}
					{pluralizeUnits(units)}
				</p>
			</div>

			<ul className={styles.items}>
				{items.map((item) => (
					<OrderProductCard key={item.key} item={item} />
				))}
			</ul>

			<div className={styles.sumTotal} style={{ marginTop: 0 }}>
				<p className={styles.sumTotalLabel}>Сумма позиций</p>
				<p className={styles.sumTotalValue} style={{ fontSize: "1.0625rem" }}>
					{formatPrice(itemsTotal)}
				</p>
			</div>
		</section>
	);
}

export default OrderProductList;
