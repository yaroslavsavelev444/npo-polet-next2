import type { Order } from "@/payload-types";
import { buildOrderSuccessView } from "../../lib/build-order-success-view";
import { OrderInfoPanel } from "../OrderInfoPanel";
import { OrderPriceSummary } from "../OrderPriceSummary";
import { OrderProductList } from "../OrderProductList";
import { OrderReveal } from "../OrderReveal";
import { OrderActions } from "./OrderActions";
import { OrderSuccessHero } from "./OrderSuccessHero";

interface OrderSuccessViewProps {
	order: Order;
}

/**
 * Композиционный корень страницы успешного оформления. Серверный компонент:
 * нормализует заказ и раскладывает блоки в bento-сетку с каскадным появлением.
 * Интерактив (конфетти) инкапсулирован в дочерних клиентских компонентах.
 */
export function OrderSuccessView({ order }: OrderSuccessViewProps) {
	const view = buildOrderSuccessView(order);

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
			<OrderReveal delay={0}>
				<OrderSuccessHero
					orderNumber={view.orderNumber}
					status={view.status}
					phone={view.recipient.phone}
					createdAt={view.createdAt}
				/>
			</OrderReveal>

			{/* Основная колонка (данные + товары) и липкая боковая со стоимостью.
			    На мобильных всё складывается в один поток: данные → товары →
			    стоимость → действия. */}
			<div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
				<div className="flex flex-col gap-4 sm:gap-5">
					<OrderReveal delay={120}>
						<OrderInfoPanel
							recipient={view.recipient}
							payment={view.payment}
							company={view.company}
							notes={view.notes}
						/>
					</OrderReveal>

					{view.items.length > 0 && (
						<OrderReveal delay={240}>
							<OrderProductList items={view.items} />
						</OrderReveal>
					)}
				</div>

				<OrderReveal delay={180} className="lg:sticky lg:top-[140px]">
					<OrderPriceSummary
						subtotal={view.pricing.subtotal}
						discount={view.pricing.discount}
						total={view.pricing.total}
					/>
				</OrderReveal>
			</div>

			<OrderReveal delay={340} className="mt-2">
				<OrderActions />
			</OrderReveal>
		</div>
	);
}
