import type { CartView } from "@/modules/cart";
import { formatPrice } from "@/modules/productCard";
import type {
  CheckoutCompanyInput,
  CheckoutDeliveryInput,
  CheckoutPaymentMethod,
  CheckoutRecipientInput,
  PickupPointOption,
  TransportCompanyOption,
} from "../types";

const DELIVERY_LABELS: Record<CheckoutDeliveryInput["method"], string> = {
  door_to_door: "Курьер до двери",
  pickup_point: "Доставка в ПВЗ",
  self_pickup: "Самовывоз",
};

const PAYMENT_LABELS: Record<CheckoutPaymentMethod, string> = {
  invoice: "По счету",
  self_pickup_card: "Картой при самовывозе",
  self_pickup_cash: "Наличными при самовывозе",
};

interface Props {
  cart: CartView;
  recipient: CheckoutRecipientInput;
  delivery: CheckoutDeliveryInput;
  company: CheckoutCompanyInput;
  paymentMethod: CheckoutPaymentMethod;
  notes: string;
  pickupPoints: PickupPointOption[];
  transportCompanies: TransportCompanyOption[];
}

export function OrderConfirmationPanel({
  cart,
  recipient,
  delivery,
  company,
  paymentMethod,
  notes,
  pickupPoints,
  transportCompanies,
}: Props) {
  const pickupPoint = pickupPoints.find((p) => p.id === delivery.pickupPointId);
  const transportCompany = transportCompanies.find(
    (t) => t.id === delivery.transportCompanyId,
  );

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        Итог заказа
      </h2>

      <div className="flex flex-col gap-1 text-sm">
        <Row label="Получатель" value={recipient.fullName || "—"} />
        <Row label="Телефон" value={recipient.phone || "—"} />
        <Row label="Email" value={recipient.email || "—"} />
      </div>

      <div className="h-px bg-[var(--border)]" />

      <div className="flex flex-col gap-1 text-sm">
        <Row label="Доставка" value={DELIVERY_LABELS[delivery.method]} />
        {delivery.method === "door_to_door" && delivery.address?.street && (
          <Row
            label="Адрес"
            value={`${delivery.address.street}, ${delivery.address.city}`}
          />
        )}
        {delivery.method === "pickup_point" && delivery.address?.city && (
          <Row label="Город" value={delivery.address.city} />
        )}
        {transportCompany && (
          <Row label="Компания" value={transportCompany.name} />
        )}
        {pickupPoint && <Row label="Пункт выдачи" value={pickupPoint.name} />}
        {delivery.notes && <Row label="Комментарий" value={delivery.notes} />}
      </div>

      {company.isCompany && (
        <>
          <div className="h-px bg-[var(--border)]" />
          <div className="flex flex-col gap-1 text-sm">
            <Row label="Компания" value={company.companyName || "—"} />
            <Row label="ИНН" value={company.taxNumber || "—"} />
          </div>
        </>
      )}

      <div className="h-px bg-[var(--border)]" />

      <Row label="Способ оплаты" value={PAYMENT_LABELS[paymentMethod]} />
      {notes && <Row label="Комментарий к заказу" value={notes} />}

      <div className="h-px bg-[var(--border)]" />

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">
          Товары ({cart.summary.totalItems} шт.)
        </span>
        <span className="font-medium text-[var(--text-primary)]">
          {formatPrice(cart.summary.priceWithoutDiscount)}
        </span>
      </div>

      {cart.summary.totalDiscount > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--success)]">Скидка</span>
          <span className="font-medium text-[var(--success)]">
            -{formatPrice(cart.summary.totalDiscount)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-[var(--text-primary)]">
          Итого
        </span>
        <span className="text-2xl font-bold text-[var(--primary)]">
          {formatPrice(cart.summary.totalPrice)}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[var(--text-secondary)]">{label}</span>
      <span className="truncate text-right text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}
