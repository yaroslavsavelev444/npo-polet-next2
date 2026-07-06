import { RevealFx } from "@once-ui-system/core";
import { formatPrice } from "@/modules/productCard";
import type { Order } from "@/payload-types";

interface OrderSuccessViewProps {
  order: Order;
}

export function OrderSuccessView({ order }: OrderSuccessViewProps) {
  const isInvoice = order.payment?.method === "invoice";

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Заголовок */}
      <RevealFx delay={0}>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-green-600 mb-2">
            Заказ успешно создан!
          </h1>
          <p className="text-xl text-[var(--text-primary)]">
            Номер заказа:{" "}
            <span className="font-semibold">{order.orderNumber}</span>
          </p>
        </div>
      </RevealFx>

      {/* Сообщение для оплаты по счёту */}
      {isInvoice && (
        <RevealFx delay={200}>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-blue-800">
            <p className="font-medium">
              Наши менеджеры уже увидели ваш заказ и скоро свяжутся с вами для
              подтверждения заказа. После этого мы вышлем вам счёт на оплату.
            </p>
          </div>
        </RevealFx>
      )}

      {/* Информация о заказе */}
      <RevealFx delay={400}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Получатель */}
          <RevealFx delay={500}>
            <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--surface)]">
              <h3 className="font-semibold mb-3">Получатель</h3>
              <p>
                <strong>{order.recipient.fullName}</strong>
              </p>
              <p>{order.recipient.phone}</p>
              <p>{order.recipient.email}</p>
            </div>
          </RevealFx>

          {/* Доставка */}
          <RevealFx delay={600}>
            <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--surface)]">
              <h3 className="font-semibold mb-3">Доставка</h3>
              <p className="capitalize">
                {order.delivery.method === "self_pickup" && "Самовывоз"}
                {order.delivery.method === "door_to_door" &&
                  "Курьером до двери"}
                {order.delivery.method === "pickup_point" && "В ПВЗ"}
              </p>
              {order.delivery.address && (
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {order.delivery.address.city}, {order.delivery.address.street}
                </p>
              )}
              {order.delivery.notes && (
                <p className="mt-2 text-sm italic">
                  Комментарий: {order.delivery.notes}
                </p>
              )}
            </div>
          </RevealFx>
        </div>
      </RevealFx>

      {/* Товары — используем твой готовый компонент */}
      {/* <RevealFx delay={800}>
        <OrderItemsSummary items={adaptOrderToCartItems(order.items)} />
      </RevealFx> */}

      {/* Итоговая стоимость */}
      <RevealFx delay={1000}>
        <div className="border border-[var(--border)] rounded-xl p-6 bg-[var(--surface)]">
          <h3 className="font-semibold mb-4">Итого</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Сумма товаров</span>
              <span>{formatPrice(order.pricing.subtotal)}</span>
            </div>
            {order.pricing.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Скидка</span>
                <span>- {formatPrice(order.pricing.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold pt-3 border-t">
              <span>К оплате</span>
              <span>{formatPrice(order.pricing.total)}</span>
            </div>
          </div>
        </div>
      </RevealFx>
    </div>
  );
}
