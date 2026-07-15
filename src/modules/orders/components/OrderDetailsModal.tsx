"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/modules/productCard";
import { Badge, Modal, Spinner } from "@/UI";
import { getOrderDetailAction } from "../actions/orders.actions";
import {
	ORDER_STATUS_BADGE_VARIANT,
	ORDER_STATUS_LABELS,
} from "../lib/status.groups";
import type { OrderDetailView, OrderListItemView, OrderStatus } from "../types";
import { CancelOrderSection } from "./CancelOrderSection";

const DELIVERY_METHOD_LABELS: Record<
	OrderDetailView["delivery"]["method"],
	string
> = {
	door_to_door: "Курьер до двери",
	pickup_point: "Доставка в ПВЗ",
	self_pickup: "Самовывоз",
};

const PAYMENT_METHOD_LABELS: Record<
	OrderDetailView["payment"]["method"],
	string
> = {
	invoice: "По счёту",
	self_pickup_card: "Картой при самовывозе",
	self_pickup_cash: "Наличными при самовывозе",
};

interface Props {
	order: OrderListItemView | null;
	onClose: () => void;
	onStatusChange: (orderId: string, status: OrderStatus) => void;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString("ru-RU", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function OrderDetailsModal({ order, onClose, onStatusChange }: Props) {
	const [detail, setDetail] = useState<OrderDetailView | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!order) {
			setDetail(null);
			setError(null);
			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setError(null);

		getOrderDetailAction(order.id).then((result) => {
			if (cancelled) return;
			if (result.success) {
				setDetail(result.data);
			} else {
				setError(result.message);
			}
			setIsLoading(false);
		});

		return () => {
			cancelled = true;
		};
	}, [order]);

	function handleCancelled(status: OrderStatus) {
		if (!order) return;
		setDetail((prev) => (prev ? { ...prev, status, canCancel: false } : prev));
		onStatusChange(order.id, status);
	}

	return (
		<Modal
			open={Boolean(order)}
			onClose={onClose}
			title={order ? `Заказ №${order.orderNumber}` : undefined}
			width={640}
		>
			{isLoading && (
				<div className="flex justify-center py-12">
					<Spinner size="md" label="Загрузка заказа..." />
				</div>
			)}

			{!isLoading && error && (
				<p className="py-6 text-center text-sm text-[var(--error)]">{error}</p>
			)}

			{!isLoading && detail && (
				<div className="flex flex-col gap-6">
					<div className="flex items-center justify-between">
						<Badge variant={ORDER_STATUS_BADGE_VARIANT[detail.status]}>
							{ORDER_STATUS_LABELS[detail.status]}
						</Badge>
						<span className="text-xs text-[var(--text-muted)]">
							от {formatDate(detail.createdAt)}
						</span>
					</div>

					<section>
						<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
							Получатель
						</h3>
						<dl className="flex flex-col gap-1 text-sm">
							<Row label="ФИО" value={detail.recipient.fullName} />
							<Row label="Телефон" value={detail.recipient.phone} />
							<Row label="Email" value={detail.recipient.email} />
						</dl>
					</section>

					<section>
						<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
							Доставка
						</h3>
						<dl className="flex flex-col gap-1 text-sm">
							<Row
								label="Способ"
								value={DELIVERY_METHOD_LABELS[detail.delivery.method]}
							/>
							{detail.delivery.address?.city && (
								<Row
									label="Адрес"
									value={[
										detail.delivery.address.city,
										detail.delivery.address.street,
									]
										.filter(Boolean)
										.join(", ")}
								/>
							)}
							{detail.delivery.transportCompanyName && (
								<Row
									label="Компания"
									value={detail.delivery.transportCompanyName}
								/>
							)}
							{detail.delivery.pickupPointName && (
								<Row
									label="Пункт выдачи"
									value={detail.delivery.pickupPointName}
								/>
							)}
							{detail.delivery.trackingNumber && (
								<Row
									label="Трек-номер"
									value={detail.delivery.trackingNumber}
								/>
							)}
							{detail.delivery.notes && (
								<Row label="Комментарий" value={detail.delivery.notes} />
							)}
						</dl>
					</section>

					<section>
						<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
							Товары ({detail.items.length})
						</h3>
						<div className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
							{detail.items.map((item) => (
								<div
									key={item.productId}
									className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
								>
									<span className="min-w-0 truncate text-[var(--text-primary)]">
										{item.name}
									</span>
									<span className="shrink-0 text-[var(--text-secondary)]">
										{item.quantity} шт. × {formatPrice(item.unitPrice)}
									</span>
									<span className="shrink-0 font-medium text-[var(--text-primary)]">
										{formatPrice(item.totalPrice)}
									</span>
								</div>
							))}
						</div>
					</section>

					<section>
						<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
							Оплата и стоимость
						</h3>
						<dl className="flex flex-col gap-1 text-sm">
							<Row
								label="Способ оплаты"
								value={PAYMENT_METHOD_LABELS[detail.payment.method]}
							/>
							<Row
								label="Сумма товаров"
								value={formatPrice(detail.pricing.subtotal)}
							/>
							{detail.pricing.discount > 0 && (
								<Row
									label="Скидка"
									value={`-${formatPrice(detail.pricing.discount)}`}
								/>
							)}
							<Row label="Итого" value={formatPrice(detail.pricing.total)} />
						</dl>
					</section>

					{detail.companyInfo?.name && (
						<section>
							<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
								Организация
							</h3>
							<dl className="flex flex-col gap-1 text-sm">
								<Row label="Название" value={detail.companyInfo.name} />
								{detail.companyInfo.taxNumber && (
									<Row label="ИНН" value={detail.companyInfo.taxNumber} />
								)}
							</dl>
						</section>
					)}

					{detail.notes && (
						<section>
							<h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
								Комментарий к заказу
							</h3>
							<p className="text-sm text-[var(--text-secondary)]">
								{detail.notes}
							</p>
						</section>
					)}

					<CancelOrderSection
						orderId={detail.id}
						canCancel={detail.canCancel}
						onCancelled={handleCancelled}
					/>
				</div>
			)}
		</Modal>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="shrink-0 text-[var(--text-secondary)]">{label}</dt>
			<dd className="truncate text-right text-[var(--text-primary)]">
				{value}
			</dd>
		</div>
	);
}
