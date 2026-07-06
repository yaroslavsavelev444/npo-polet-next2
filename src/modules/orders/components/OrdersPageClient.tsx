"use client";

import { useState } from "react";
import { isOrderCancellable } from "../lib/status.groups";
import type {
  OrderListItemView,
  OrderStatus,
  OrdersListResult,
} from "../types";
import { OrderDetailsModal } from "./OrderDetailsModal";
import { OrderList } from "./OrderList";

interface Props {
  initialResult: OrdersListResult;
}

export function OrdersPageClient({ initialResult }: Props) {
  const [orders, setOrders] = useState<OrderListItemView[]>(
    initialResult.orders,
  );
  const [selectedOrder, setSelectedOrder] = useState<OrderListItemView | null>(
    null,
  );

  function handleStatusChange(orderId: string, status: OrderStatus) {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status, canCancel: isOrderCancellable(status) }
          : o,
      ),
    );
    setSelectedOrder((prev) =>
      prev && prev.id === orderId
        ? { ...prev, status, canCancel: false }
        : prev,
    );
  }

  return (
    <>
      <OrderList orders={orders} onSelect={setSelectedOrder} />
      <OrderDetailsModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}
