import { Badge } from "@/UI";
import {
	ORDER_STATUS_BADGE_VARIANT,
	ORDER_STATUS_LABELS,
} from "../lib/status.groups";
import type { OrderStatus } from "../types";

interface OrderStatusBadgeProps {
	status: OrderStatus;
	size?: "sm" | "md";
}

/** Бейдж статуса заказа — единая подпись и цвет по всему приложению. */
export function OrderStatusBadge({
	status,
	size = "md",
}: OrderStatusBadgeProps) {
	return (
		<Badge variant={ORDER_STATUS_BADGE_VARIANT[status]} size={size} dot>
			{ORDER_STATUS_LABELS[status]}
		</Badge>
	);
}
