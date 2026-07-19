import {
	CalendarClock,
	MapPin,
	MessageSquareText,
	Package,
	Phone,
	Store,
	Truck,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatOrderDate } from "../lib/format-date";
import { DELIVERY_METHOD_LABELS } from "../lib/labels";
import type { OrderDetailView } from "../types";
import { OrderField, OrderFieldGroup } from "./OrderField";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

type Delivery = OrderDetailView["delivery"];

interface OrderDeliveryPanelProps {
	delivery: Delivery;
}

const METHOD_ICON: Record<
	Delivery["method"],
	ComponentType<{ size?: number; className?: string }>
> = {
	door_to_door: Truck,
	pickup_point: Package,
	self_pickup: Store,
};

function formatAddress(address: NonNullable<Delivery["address"]>): string {
	// Обратная совместимость: у старых заказов весь адрес лежит в street, полей
	// house/apartment нет — тогда просто выводим street как есть. У новых заказов
	// house/apartment заполнены и добавляются к улице отдельными сегментами.
	const streetLine = [
		address.street,
		address.house ? `д. ${address.house}` : null,
		address.apartment ? `кв. ${address.apartment}` : null,
	]
		.filter(Boolean)
		.join(", ");

	return [
		address.postalCode,
		address.city,
		streetLine || null,
		address.country && address.country !== "Россия" ? address.country : null,
	]
		.filter(Boolean)
		.join(", ");
}

/**
 * Детали доставки с учётом способа получения. Показываются только заполненные
 * поля: у самовывоза — пункт выдачи, у курьера — адрес и перевозчик, у ПВЗ —
 * перевозчик и трек-номер.
 */
export function OrderDeliveryPanel({ delivery }: OrderDeliveryPanelProps) {
	const MethodIcon = METHOD_ICON[delivery.method];
	const addressText = delivery.address ? formatAddress(delivery.address) : "";

	return (
		<section className={`flex flex-col gap-6 p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<OrderFieldGroup title="Получение">
				<OrderField
					icon={MethodIcon}
					label="Способ"
					value={DELIVERY_METHOD_LABELS[delivery.method]}
				/>

				{delivery.method === "self_pickup" && delivery.pickupPointName && (
					<OrderField
						icon={MapPin}
						label="Пункт самовывоза"
						value={
							delivery.pickupPointAddress
								? `${delivery.pickupPointName} · ${delivery.pickupPointAddress}`
								: delivery.pickupPointName
						}
					/>
				)}

				{addressText && (
					<OrderField icon={MapPin} label="Адрес" value={addressText} />
				)}

				{delivery.transportCompanyName && (
					<OrderField
						icon={Truck}
						label="Транспортная компания"
						value={delivery.transportCompanyName}
					/>
				)}

				{delivery.transportCompanyPhone && (
					<OrderField
						icon={Phone}
						label="Телефон перевозчика"
						value={delivery.transportCompanyPhone}
						href={`tel:${delivery.transportCompanyPhone.replace(/[^\d+]/g, "")}`}
					/>
				)}

				{delivery.trackingNumber && (
					<OrderField
						icon={Package}
						label="Трек-номер"
						value={delivery.trackingNumber}
					/>
				)}

				{delivery.estimatedDelivery && (
					<OrderField
						icon={CalendarClock}
						label="Ожидаемая дата"
						value={formatOrderDate(delivery.estimatedDelivery)}
					/>
				)}

				{delivery.notes && (
					<OrderField
						icon={MessageSquareText}
						label="Комментарий к доставке"
						value={delivery.notes}
					/>
				)}
			</OrderFieldGroup>
		</section>
	);
}
