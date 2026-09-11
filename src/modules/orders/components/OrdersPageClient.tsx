"use client";

import { PackageSearch, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { getOrderDetailAction } from "../actions/orders.actions";
import { isOrderCancellable } from "../lib/status.groups";
import type {
	OrderFilterGroup,
	OrderListItemView,
	OrderStatus,
	OrdersListResult,
} from "../types";
import { type OrderDetailState, OrderRow } from "./OrderRow";
import styles from "./Orders.module.css";

interface Props {
	initialResult: OrdersListResult;
	/** Активный отбор — от него зависит текст пустого состояния. */
	group: OrderFilterGroup;
}

const EMPTY_COPY: Record<OrderFilterGroup, { title: string; text: string }> = {
	all: {
		title: "Заказов пока нет",
		text: "Оформленные заказы появятся здесь: состав, статус, документы и расчёт по каждому.",
	},
	current: {
		title: "Нет заказов в работе",
		text: "Все ваши заказы уже завершены или отменены. Загляните в другие вкладки.",
	},
	completed: {
		title: "Завершённых заказов нет",
		text: "Сюда попадают заказы, которые вы уже получили.",
	},
	cancelled: {
		title: "Отменённых заказов нет",
		text: "Сюда попадают отменённые заказы и оформленные по ним возвраты.",
	},
	past: {
		title: "Прошедших заказов нет",
		text: "Сюда попадают полученные, отменённые и возвращённые заказы.",
	},
};

/**
 * Список заказов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГДЕ ЖИВУТ ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Список приходит с сервера готовой страницей (отбор и постраничная навигация
 * серверные — заказов у покупателя бывают сотни, и грузить их все ради
 * фильтра нельзя). Подробности заказа догружаются по первому раскрытию
 * отдельным действием и остаются в памяти вкладки: повторное открытие того же
 * заказа на сервер не идёт.
 *
 * Открытых заказов может быть несколько одновременно. Аккордеон, закрывающий
 * соседа, мешает ровно тому, ради чего список и открывают, — сравнить два
 * заказа между собой.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТМЕНА
 * ────────────────────────────────────────────────────────────────────────────
 * После отмены статус меняется и в строке списка, и в раскрытых подробностях,
 * и пересчитывается право на отмену — тем же правилом isOrderCancellable, что
 * и на сервере. Перезагружать страницу ради одной изменившейся строки не
 * нужно.
 */
export function OrdersPageClient({ initialResult, group }: Props) {
	const [orders, setOrders] = useState<OrderListItemView[]>(
		initialResult.orders,
	);
	const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
	const [details, setDetails] = useState<Record<string, OrderDetailState>>({});

	const loadDetail = useCallback(async (orderId: string) => {
		setDetails((prev) => ({ ...prev, [orderId]: { kind: "loading" } }));
		const result = await getOrderDetailAction(orderId);
		setDetails((prev) => ({
			...prev,
			[orderId]: result.success
				? { kind: "ready", detail: result.data }
				: { kind: "error", message: result.message },
		}));
	}, []);

	const toggle = useCallback(
		(orderId: string) => {
			setOpenIds((prev) => {
				const next = new Set(prev);
				if (next.has(orderId)) next.delete(orderId);
				else next.add(orderId);
				return next;
			});

			// Догрузка решается ЗДЕСЬ, а не внутри setDetails: обновляющую функцию
			// React в строгом режиме вызывает дважды, и запрос ушёл бы на сервер
			// два раза. Значение из замыкания — состояние текущей отрисовки, а
			// обработчик события вызывается уже после неё.
			const current = details[orderId];
			if (!current || current.kind === "error") void loadDetail(orderId);
		},
		[details, loadDetail],
	);

	const handleCancelled = useCallback(
		(orderId: string, status: OrderStatus) => {
			const canCancel = isOrderCancellable(status);

			setOrders((prev) =>
				prev.map((order) =>
					order.id === orderId ? { ...order, status, canCancel } : order,
				),
			);

			setDetails((prev) => {
				const current = prev[orderId];
				if (!current || current.kind !== "ready") return prev;
				return {
					...prev,
					[orderId]: {
						kind: "ready",
						detail: { ...current.detail, status, canCancel },
					},
				};
			});
		},
		[],
	);

	if (orders.length === 0) {
		const copy = EMPTY_COPY[group];
		return (
			<div className={styles.empty}>
				<PackageSearch
					size={28}
					strokeWidth={1.25}
					aria-hidden
					className="text-[var(--border-light)]"
				/>
				<p className={styles.emptyTitle}>{copy.title}</p>
				<p className={styles.emptyText}>{copy.text}</p>
				{group === "all" && (
					<Link
						href="/category"
						className={`${styles.btn} ${styles.btnPrimary}`}
					>
						<ShoppingBag size={15} aria-hidden />
						Перейти в каталог
					</Link>
				)}
			</div>
		);
	}

	return (
		<>
			<ul className={styles.list}>
				{orders.map((order, index) => (
					<OrderRow
						key={order.id}
						order={order}
						index={index}
						open={openIds.has(order.id)}
						onToggle={() => toggle(order.id)}
						detail={details[order.id] ?? { kind: "idle" }}
						onRetry={() => void loadDetail(order.id)}
						onCancelled={(status) => handleCancelled(order.id, status)}
					/>
				))}
			</ul>

			{/* Конец выдачи отмечен так же, как в каталоге: линия со служебной
			    подписью. Без неё непонятно, кончился список или не догрузился. */}
			<div className={styles.tail}>
				<span aria-hidden className={styles.tailRule} />
				<p className={catalog.micro}>
					{initialResult.totalPages > 1
						? `Страница ${initialResult.page} из ${initialResult.totalPages}`
						: `Показаны все ${orders.length}`}
				</p>
				<span aria-hidden className={styles.tailRule} />
			</div>
		</>
	);
}

export default OrdersPageClient;
