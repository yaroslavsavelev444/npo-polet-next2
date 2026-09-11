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
import { formatAddress } from "@/modules/checkout/lib/address";
import { formatOrderDate } from "../lib/format-date";
import { DELIVERY_METHOD_LABELS } from "../lib/labels";
import type { OrderDetailView } from "../types";
import { OrderField } from "./OrderField";
import styles from "./Orders.module.css";

type Delivery = OrderDetailView["delivery"];

interface OrderDeliveryPanelProps {
	delivery: Delivery;
}

const METHOD_ICON: Record<
	Delivery["method"],
	ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
	door_to_door: Truck,
	pickup_point: Package,
	self_pickup: Store,
};

/**
 * Получение заказа: способ, куда и когда.
 *
 * Показываются только заполненные поля — у самовывоза нет перевозчика, у
 * курьера нет пункта выдачи, и пустые строки «—» на их месте были бы шумом.
 *
 * Трек-номер набран моноширинным: его переписывают в поле на сайте
 * перевозчика, и пропорциональные цифры при этом читаются с ошибками.
 */
export function OrderDeliveryPanel({ delivery }: OrderDeliveryPanelProps) {
	const MethodIcon = METHOD_ICON[delivery.method];
	// Одна функция форматирования на весь проект (см. checkout/lib/address):
	// она поддерживает все три поколения адресов — строку целиком в `street`,
	// разбитые поля и канонический `fullAddress` из подсказок. Квартира,
	// подъезд и этаж выводятся только для курьера: в ПВЗ и самовывозе их не
	// существует.
	const addressText = formatAddress(delivery.address, {
		withUnitDetails: delivery.method === "door_to_door",
	});

	return (
		<section className={styles.block}>
			<div className={styles.blockHead}>
				<h3 className={styles.blockTitle}>
					<MapPin size={13} aria-hidden />
					Получение
				</h3>
			</div>

			<dl className={styles.fields}>
				<OrderField
					icon={MethodIcon}
					label="Способ"
					value={DELIVERY_METHOD_LABELS[delivery.method]}
				/>

				{delivery.method === "self_pickup" && delivery.pickupPointName && (
					<OrderField
						icon={Store}
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
						code
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
			</dl>
		</section>
	);
}

export default OrderDeliveryPanel;
