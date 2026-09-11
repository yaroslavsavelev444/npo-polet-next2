import {
	CheckCircle2,
	Clock,
	Cog,
	FileText,
	Package,
	PackageCheck,
	Store,
	Truck,
	Undo2,
	XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { ORDER_STATUS_LABELS } from "../lib/status.groups";
import {
	ORDER_STATUS_VIEW,
	type OrderStatusIcon,
	type OrderStatusTone,
} from "../lib/status-view";
import type { OrderStatus } from "../types";
import styles from "./Orders.module.css";

type IconComponent = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

const ICONS: Record<OrderStatusIcon, IconComponent> = {
	clock: Clock,
	invoice: FileText,
	check: CheckCircle2,
	cog: Cog,
	box: PackageCheck,
	truck: Truck,
	store: Store,
	done: Package,
	cancel: XCircle,
	refund: Undo2,
};

const TONE_CLASS: Record<OrderStatusTone, string> = {
	wait: styles.statusWait,
	progress: styles.statusProgress,
	action: styles.statusAction,
	done: styles.statusDone,
	stopped: styles.statusStopped,
};

interface OrderStatusBadgeProps {
	status: OrderStatus;
	className?: string;
}

/**
 * Статус заказа: значок, подпись словом и тон.
 *
 * Цвет здесь только усиливает. Различают статусы силуэт значка и сама
 * подпись — они работают при дальтонизме, на плохом экране и в распечатке,
 * тогда как одна заливка не работает ни в одном из этих случаев.
 *
 * Подпись берётся из ORDER_STATUS_LABELS — того же источника, что у timeline
 * и страницы успеха: два набора подписей для одних и тех же статусов
 * разошлись бы на первой же правке.
 */
export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
	const view = ORDER_STATUS_VIEW[status];
	const Icon = ICONS[view.icon];

	return (
		<span
			className={`${styles.status} ${TONE_CLASS[view.tone]} ${className ?? ""}`}
		>
			<Icon size={13} aria-hidden />
			{ORDER_STATUS_LABELS[status]}
		</span>
	);
}

export default OrderStatusBadge;
