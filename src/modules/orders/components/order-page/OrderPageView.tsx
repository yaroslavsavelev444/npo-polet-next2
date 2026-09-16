import { Route } from "lucide-react";
import type { ReactNode } from "react";
import type { Order } from "@/payload-types";
import { PageContainer } from "@/shared/components/PageContainer";
import { mapOrderToDetailView } from "../../lib/build-order-list-view";
import { buildOrderTimeline } from "../../lib/status-flow";
import { ORDER_STATUS_VIEW } from "../../lib/status-view";
import { OrderAttachments } from "../OrderAttachments";
import { OrderDeliveryPanel } from "../OrderDeliveryPanel";
import { OrderInfoPanel } from "../OrderInfoPanel";
import { OrderPriceSummary } from "../OrderPriceSummary";
import { OrderProductList } from "../OrderProductList";
import { OrderReveal } from "../OrderReveal";
import styles from "../Orders.module.css";
import { OrderTimeline } from "../OrderTimeline";
import { OrderCancelPanel } from "./OrderCancelPanel";
import { OrderPageActions } from "./OrderPageActions";
import { OrderPageHero } from "./OrderPageHero";

interface Props {
	order: Order;
	/** Цепочка навигации, отрисованная на сервере. */
	breadcrumbs: ReactNode;
}

/**
 * Страница заказа.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ЭТО НЕ «СТРАНИЦА СПАСИБО»
 * ════════════════════════════════════════════════════════════════════════════
 * Один и тот же адрес открывается и сразу после оформления, и через месяц из
 * «Моих заказов», и по прямой ссылке. Поэтому страница построена вокруг
 * СОСТОЯНИЯ заказа, а не вокруг факта его создания: заголовок, знак и путь
 * берутся из статуса, а праздник (конфетти) добавляется только тому переходу,
 * который пришёл прямо с оформления (см. lib/celebrate-order).
 *
 * Прежняя версия писала «Заказ оформлен» и запускала конфетти всегда — в том
 * числе над отменённым заказом. И не показывала способ получения вовсе: её
 * модель (build-order-success-view) просто не содержала доставку, хотя это
 * первое, что спрашивают у заказа после суммы.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ПОРЯДОК БЛОКОВ
 * ════════════════════════════════════════════════════════════════════════════
 * Он отвечает на вопросы в том порядке, в каком они возникают:
 *
 *   1. оформлен ли и что с ним сейчас — первый экран;
 *   2. что будет дальше — путь заказа;
 *   3. что я заказал — состав;
 *   4. куда это едет и на кого оформлено — получение и данные;
 *   5. чем подтверждается — документы;
 *   6. сколько это стоит и из чего сложилось — расчёт;
 *   7. что я могу сделать — действия.
 *
 * На широком экране расчёт и действия уезжают в липкую колонку справа: сумма
 * и «что дальше» обязаны быть перед глазами, пока человек читает состав. На
 * узком всё складывается в один поток в том же порядке — расчёт после состава,
 * действия последними.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ОТКУДА ДАННЫЕ
 * ════════════════════════════════════════════════════════════════════════════
 * Из mapOrderToDetailView — ТОЙ ЖЕ модели, по которой живёт раскрытый заказ в
 * «Моих заказах». Один заказ, показанный в двух местах, обязан быть одним и
 * тем же заказом; вторая модель поменьше (какой была build-order-success-view)
 * гарантированно разойдётся с первой на ближайшей правке — она уже разошлась,
 * потеряв доставку.
 *
 * Все блоки ниже — те же компоненты, что и в списке заказов. Это и есть
 * связь с «Моими заказами»: не похожие стили, а буквально один код.
 */
export function OrderPageView({ order, breadcrumbs }: Props) {
	const detail = mapOrderToDetailView(order);
	const view = ORDER_STATUS_VIEW[detail.status];

	const timeline = buildOrderTimeline({
		status: detail.status,
		deliveryMethod: detail.delivery.method,
		paymentMethod: detail.payment.method,
		statusHistory: detail.statusHistory,
	});

	return (
		<>
			<OrderPageHero order={detail} breadcrumbs={breadcrumbs} />

			<PageContainer className={styles.pageBody}>
				<div className={styles.pageLayout}>
					<div className={styles.pageMain}>
						{/* Что делать прямо сейчас — до всего остального. Показывается
						    только когда ход за покупателем: подсказка «заказ собирают»
						    здесь превратилась бы в шум, который перестают читать. */}
						{view.tone === "action" && (
							<OrderReveal delay={60}>
								<p className={`${styles.notice} ${styles.noticeAction}`}>
									<Route
										size={15}
										aria-hidden
										className={`${styles.noticeIcon} ${styles.noticeActionIcon}`}
									/>
									{view.hint}
								</p>
							</OrderReveal>
						)}

						<OrderReveal delay={100}>
							<section className={styles.block}>
								<div className={styles.blockHead}>
									<h2 className={styles.blockTitle}>
										<Route size={13} aria-hidden />
										Путь заказа
									</h2>
									<p className={styles.blockNote}>{view.hint}</p>
								</div>
								<OrderTimeline steps={timeline} />
							</section>
						</OrderReveal>

						{detail.items.length > 0 && (
							<OrderReveal delay={180}>
								<OrderProductList items={detail.items} />
							</OrderReveal>
						)}

						<OrderReveal delay={260}>
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
						</OrderReveal>

						{detail.attachments.length > 0 && (
							<OrderReveal delay={320}>
								<OrderAttachments attachments={detail.attachments} />
							</OrderReveal>
						)}
					</div>

					<aside className={styles.pageRail} aria-label="Стоимость и действия">
						<OrderReveal delay={140} className={styles.pageRailInner}>
							<OrderPriceSummary
								subtotal={detail.pricing.subtotal}
								discount={detail.pricing.discount}
								total={detail.pricing.total}
								shippingCost={detail.pricing.shippingCost}
								promo={detail.promo}
								paymentStatus={detail.payment.status}
							/>

							<OrderPageActions status={detail.status} />

							<OrderCancelPanel
								orderId={detail.id}
								orderNumber={detail.orderNumber}
								canCancel={detail.canCancel}
							/>
						</OrderReveal>
					</aside>
				</div>
			</PageContainer>
		</>
	);
}

export default OrderPageView;
