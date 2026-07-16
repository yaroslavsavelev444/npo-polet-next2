import { formatPrice } from "@/modules/productCard";
import { formatOrderDateTime } from "../lib/format-date";
import { buildOrderTimeline } from "../lib/status-flow";
import type { OrderDetailView, OrderStatus } from "../types";
import { CancelOrderSection } from "./CancelOrderSection";
import { OrderAttachments } from "./OrderAttachments";
import { OrderDeliveryPanel } from "./OrderDeliveryPanel";
import { OrderInfoPanel } from "./OrderInfoPanel";
import { OrderPriceSummary } from "./OrderPriceSummary";
import { OrderProductList } from "./OrderProductList";
import { OrderReveal } from "./OrderReveal";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderTimeline } from "./OrderTimeline";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderDetailContentProps {
	detail: OrderDetailView;
	onCancelled: (status: OrderStatus) => void;
}

/**
 * Bento-содержимое просмотра заказа: краткая шапка, timeline, товары, доставка,
 * данные, вложения, стоимость и отмена. Отделено от контейнера (модалка/шит),
 * поэтому переиспользуемо в других местах (напр. отдельная страница заказа).
 */
export function OrderDetailContent({
	detail,
	onCancelled,
}: OrderDetailContentProps) {
	const timeline = buildOrderTimeline({
		status: detail.status,
		deliveryMethod: detail.delivery.method,
		paymentMethod: detail.payment.method,
		statusHistory: detail.statusHistory,
	});

	return (
		<div className="flex flex-col gap-3 sm:gap-4">
			{/* Шапка: статус, дата, итог */}
			<OrderReveal delay={0}>
				<div
					className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${ORDER_CARD_CLASS}`}
				>
					<div className="flex flex-col gap-1.5">
						<OrderStatusBadge status={detail.status} />
						<span className="text-xs text-[var(--text-muted)]">
							от {formatOrderDateTime(detail.createdAt)}
						</span>
					</div>
					<div className="text-right">
						<p className="text-xs text-[var(--text-secondary)]">Сумма заказа</p>
						<p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
							{formatPrice(detail.total)}
						</p>
					</div>
				</div>
			</OrderReveal>

			{/* Timeline статусов */}
			<OrderReveal delay={70}>
				<OrderTimeline steps={timeline} />
			</OrderReveal>

			{/* Товары */}
			{detail.items.length > 0 && (
				<OrderReveal delay={140}>
					<OrderProductList items={detail.items} />
				</OrderReveal>
			)}

			{/* Доставка + данные пользователя */}
			<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 lg:items-start">
				<OrderReveal delay={210}>
					<OrderDeliveryPanel delivery={detail.delivery} />
				</OrderReveal>
				<OrderReveal delay={260}>
					<OrderInfoPanel
						recipient={detail.recipient}
						payment={detail.payment}
						company={detail.companyInfo}
						notes={detail.notes}
					/>
				</OrderReveal>
			</div>

			{/* Вложения от администратора (счёт, документы) */}
			{detail.attachments.length > 0 && (
				<OrderReveal delay={320}>
					<OrderAttachments attachments={detail.attachments} />
				</OrderReveal>
			)}

			{/* Стоимость */}
			<OrderReveal delay={370}>
				<OrderPriceSummary
					subtotal={detail.pricing.subtotal}
					discount={detail.pricing.discount}
					total={detail.pricing.total}
					shippingCost={detail.pricing.shippingCost}
					paymentStatus={detail.payment.status}
				/>
			</OrderReveal>

			{detail.canCancel && (
				<OrderReveal delay={420}>
					<CancelOrderSection
						orderId={detail.id}
						canCancel={detail.canCancel}
						onCancelled={onCancelled}
					/>
				</OrderReveal>
			)}
		</div>
	);
}
