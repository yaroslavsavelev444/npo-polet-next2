import {
	getOrderStatusesForUser,
	getOrdersByUserId,
} from "@/payload/services/orders.service";
import type { OrderFilterGroup, OrdersListResult } from "../types";
import { mapOrderToListItem } from "./build-order-list-view";
import { getStatusesForGroup, ORDER_FILTER_GROUPS } from "./status.groups";

export const ORDERS_PAGE_SIZE = 10;

export async function getOrdersListView(
	userId: string,
	group: OrderFilterGroup,
	page: number,
): Promise<OrdersListResult> {
	const statuses = getStatusesForGroup(group);
	const result = await getOrdersByUserId(userId, {
		statuses,
		page,
		limit: ORDERS_PAGE_SIZE,
	});

	return {
		orders: result.docs.map(mapOrderToListItem),
		totalDocs: result.totalDocs,
		totalPages: result.totalPages,
		page: result.page,
		hasNextPage: result.hasNextPage,
		hasPrevPage: result.hasPrevPage,
	};
}

/** Сколько заказов в каждой вкладке отбора плюс две сводные величины. */
export interface OrdersSummary {
	total: number;
	/** Заказы, по которым ещё идёт работа, — вкладка «Текущие». */
	active: number;
	byGroup: Record<OrderFilterGroup, number>;
}

/**
 * Счётчики для первого экрана и вкладок отбора.
 *
 * Считаются из ОДНОГО запроса статусов (см. getOrderStatusesForUser): пять
 * вкладок — это пять пересекающихся наборов статусов, и отдельный count на
 * каждую означал бы пять обращений к базе ради пяти чисел.
 *
 * Группы намеренно пересекаются («Прошедшие» включает и завершённые, и
 * отменённые) — это не ошибка подсчёта, а устройство самих групп, см.
 * ORDER_FILTER_GROUPS.
 */
export async function getOrdersSummary(userId: string): Promise<OrdersSummary> {
	const statuses = await getOrderStatusesForUser(userId);

	const byGroup = ORDER_FILTER_GROUPS.reduce(
		(acc, group) => {
			acc[group.key] = group.statuses
				? statuses.filter((status) => group.statuses?.includes(status)).length
				: statuses.length;
			return acc;
		},
		{} as Record<OrderFilterGroup, number>,
	);

	return { total: statuses.length, active: byGroup.current, byGroup };
}
