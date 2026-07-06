import { Empty } from "@/UI";
import type { OrderListItemView } from "../types";
import { OrderItem } from "./OrderItem";

interface Props {
  orders: OrderListItemView[];
  onSelect: (order: OrderListItemView) => void;
}

export function OrderList({ orders, onSelect }: Props) {
  if (orders.length === 0) {
    return (
      <Empty
        message="Заказов не найдено"
        description="В этой категории пока нет заказов"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <OrderItem
          key={order.id}
          order={order}
          onSelect={() => onSelect(order)}
        />
      ))}
    </div>
  );
}
