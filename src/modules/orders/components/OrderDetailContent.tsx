import { ArrowUpRight, Route } from "lucide-react";
import Link from "next/link";
import { buildOrderTimeline } from "../lib/status-flow";
import { ORDER_STATUS_VIEW } from "../lib/status-view";
import type { OrderDetailView, OrderStatus } from "../types";
import { CancelOrderSection } from "./CancelOrderSection";
import { OrderAttachments } from "./OrderAttachments";
import { OrderDeliveryPanel } from "./OrderDeliveryPanel";
import { OrderInfoPanel } from "./OrderInfoPanel";
import { OrderPriceSummary } from "./OrderPriceSummary";
import { OrderProductList } from "./OrderProductList";
import styles from "./Orders.module.css";
import { OrderTimeline } from "./OrderTimeline";

interface OrderDetailContentProps {
	detail: OrderDetailView;
	onCancelled: (status: OrderStatus) => void;
}

/**
 * Подробности заказа — содержимое раскрытой строки списка.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОРЯДОК БЛОКОВ
 * ────────────────────────────────────────────────────────────────────────────
 * Он отвечает на вопросы в том порядке, в каком они возникают у человека,
 * который только что открыл заказ:
 *
 *   1. что сейчас происходит и что дальше — путь заказа;
 *   2. что я заказал — состав;
 *   3. куда это едет и на кого оформлено — получение и данные;
 *   4. чем подтверждается — документы;
 *   5. сколько это стоит — расчёт;
 *   6. что я могу сделать — действия.
 *
 * Стоимость стоит НИЖЕ состава, а не рядом с ним: проверить расчёт можно
 * только после того, как увидел позиции, а итог всё равно уже назван в
 * свёрнутой строке — здесь он нужен разложенным, а не громким.
 *
 * Отделено от контейнера, поэтому переиспользуемо: сегодня это раскрытие в
 * списке, завтра — отдельная страница заказа.
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

	const hint = ORDER_STATUS_VIEW[detail.status].hint;
	const needsAction = ORDER_STATUS_VIEW[detail.status].tone === "action";

	return (
		<div className={styles.panelBody}>
			{/* Что делать прямо сейчас — до всего остального. Показывается только
			    когда ход за покупателем: подсказка «заказ собирают» под каждым
			    заказом превратилась бы в шум, который перестают читать. */}
			{needsAction && (
				<p className={`${styles.notice} ${styles.noticeAction}`}>
					<Route
						size={15}
						aria-hidden
						className={`${styles.noticeIcon} ${styles.noticeActionIcon}`}
					/>
					{hint}
				</p>
			)}

			<section className={styles.block}>
				<div className={styles.blockHead}>
					<h3 className={styles.blockTitle}>
						<Route size={13} aria-hidden />
						Путь заказа
					</h3>
				</div>
				<OrderTimeline steps={timeline} />
			</section>

			{detail.items.length > 0 && <OrderProductList items={detail.items} />}

			<div className={styles.columns}>
				<OrderDeliveryPanel delivery={detail.delivery} />
				<OrderInfoPanel
					contact={detail.contact}
					recipient={detail.recipient}
					payment={detail.payment}
					company={detail.companyInfo}
					notes={detail.notes}
				/>
			</div>

			{detail.attachments.length > 0 && (
				<OrderAttachments attachments={detail.attachments} />
			)}

			<OrderPriceSummary
				subtotal={detail.pricing.subtotal}
				discount={detail.pricing.discount}
				total={detail.pricing.total}
				shippingCost={detail.pricing.shippingCost}
				promo={detail.promo}
				paymentStatus={detail.payment.status}
			/>

			<div className={styles.actions}>
				<Link
					href={`/orders/${detail.orderNumber}`}
					className={`${styles.btn} ${styles.btnQuiet}`}
				>
					Открыть страницу заказа
					<ArrowUpRight size={15} aria-hidden />
				</Link>
			</div>

			<CancelOrderSection
				orderId={detail.id}
				orderNumber={detail.orderNumber}
				canCancel={detail.canCancel}
				onCancelled={onCancelled}
			/>
		</div>
	);
}

export default OrderDetailContent;
