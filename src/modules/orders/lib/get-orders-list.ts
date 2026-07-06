import { getOrdersByUserId } from "@/payload/services/orders.service";
import type { OrderFilterGroup, OrdersListResult } from "../types";
import { mapOrderToListItem } from "./build-order-list-view";
import { getStatusesForGroup } from "./status.groups";

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
