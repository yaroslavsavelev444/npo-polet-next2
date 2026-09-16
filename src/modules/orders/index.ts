export {
	cancelOrderAction,
	getOrderDetailAction,
} from "./actions/orders.actions";
export { CancelOrderSection } from "./components/CancelOrderSection";
export { OrderAttachments } from "./components/OrderAttachments";
export { OrderDeliveryPanel } from "./components/OrderDeliveryPanel";
export { OrderDetailContent } from "./components/OrderDetailContent";
export { OrderField } from "./components/OrderField";
export { OrderInfoPanel } from "./components/OrderInfoPanel";
export { OrderPriceSummary } from "./components/OrderPriceSummary";
export { OrderProductCard } from "./components/OrderProductCard";
export { OrderProductList } from "./components/OrderProductList";
export { OrderReveal } from "./components/OrderReveal";
export { OrderRow } from "./components/OrderRow";
export { OrderStatusBadge } from "./components/OrderStatusBadge";
export { OrdersHero } from "./components/OrdersHero";
export { OrdersPageClient } from "./components/OrdersPageClient";
export { OrdersPagination } from "./components/OrdersPagination";
export { OrdersRail } from "./components/OrdersRail";
export { OrderTimeline } from "./components/OrderTimeline";
export { OrderPageView } from "./components/order-page/OrderPageView";

// markOrderJustCreated ЗДЕСЬ НЕТ намеренно. Эта бочка тянет за собой
// get-orders-list → orders.service → Payload → nodemailer, то есть серверное
// дерево целиком. Клиентскому коду (форме оформления заказа) отметка нужна
// одна, и он импортирует её прямо из lib/celebrate-order — файла, который не
// импортирует ничего. Через бочку тот же импорт кладёт сборку с ошибкой
// «Can't resolve 'child_process'».
export {
	getOrdersListView,
	getOrdersSummary,
	type OrdersSummary,
} from "./lib/get-orders-list";
export {
	DELIVERY_METHOD_LABELS,
	PAYMENT_METHOD_LABELS,
	PAYMENT_STATUS_LABELS,
} from "./lib/labels";
export { mapOrderLineItems, type OrderLineItem } from "./lib/order-line-item";
export {
	isValidFilterGroup,
	ORDER_FILTER_GROUPS,
	ORDER_STATUS_LABELS,
} from "./lib/status.groups";
export {
	buildOrderTimeline,
	type TimelineStep,
} from "./lib/status-flow";
export {
	isTerminalStatus,
	ORDER_STATUS_VIEW,
	type OrderStatusTone,
} from "./lib/status-view";

export type {
	OrderAttachment,
	OrderDetailView,
	OrderFilterGroup,
	OrderItemPreview,
	OrderListItemView,
	OrderStatusHistoryEntry,
	OrdersListResult,
} from "./types";
