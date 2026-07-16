"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { Drawer, Modal, Spinner } from "@/UI";
import { getOrderDetailAction } from "../actions/orders.actions";
import type { OrderDetailView, OrderListItemView, OrderStatus } from "../types";
import { OrderDetailContent } from "./OrderDetailContent";

interface Props {
	order: OrderListItemView | null;
	onClose: () => void;
	onStatusChange: (orderId: string, status: OrderStatus) => void;
}

function ModalBody({
	isLoading,
	error,
	detail,
	onCancelled,
}: {
	isLoading: boolean;
	error: string | null;
	detail: OrderDetailView | null;
	onCancelled: (status: OrderStatus) => void;
}) {
	if (isLoading) {
		return (
			<div className="flex justify-center py-16">
				<Spinner size="md" label="Загрузка заказа..." />
			</div>
		);
	}

	if (error) {
		return (
			<p className="py-12 text-center text-sm text-[var(--error)]">{error}</p>
		);
	}

	if (!detail) return null;

	return (
		<div className="order-content-enter">
			<OrderDetailContent detail={detail} onCancelled={onCancelled} />
		</div>
	);
}

/**
 * Просмотр заказа: центрированная модалка на десктопе и bottom sheet на
 * мобильных (большинство пользователей). Данные подгружаются при открытии.
 * Тело идентично в обоих режимах — [[OrderDetailContent]].
 */
export function OrderDetailsModal({ order, onClose, onStatusChange }: Props) {
	const isMobile = useMediaQuery("(max-width: 767px)");
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
		setDetail(null);

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

	const title = order ? `Заказ №${order.orderNumber}` : undefined;
	const body = (
		<ModalBody
			isLoading={isLoading}
			error={error}
			detail={detail}
			onCancelled={handleCancelled}
		/>
	);

	if (isMobile) {
		return (
			<Drawer
				open={Boolean(order)}
				onClose={onClose}
				title={title}
				placement="bottom"
				size="94vh"
				className="rounded-t-[var(--radius-xl)]"
			>
				{body}
			</Drawer>
		);
	}

	return (
		<Modal open={Boolean(order)} onClose={onClose} title={title} width={920}>
			{body}
		</Modal>
	);
}
