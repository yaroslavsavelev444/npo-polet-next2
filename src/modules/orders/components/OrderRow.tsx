"use client";

import { AlertCircle, ChevronDown, RotateCcw } from "lucide-react";
import type { CSSProperties } from "react";
import { formatPrice } from "@/modules/productCard";
import { formatOrderDate } from "../lib/format-date";
import { DELIVERY_METHOD_LABELS } from "../lib/labels";
import { buildOrderTimeline } from "../lib/status-flow";
import { isTerminalStatus, ORDER_STATUS_VIEW } from "../lib/status-view";
import type { OrderDetailView, OrderListItemView, OrderStatus } from "../types";
import { OrderDetailContent } from "./OrderDetailContent";
import { OrderStatusBadge } from "./OrderStatusBadge";
import styles from "./Orders.module.css";

export type OrderDetailState =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "ready"; detail: OrderDetailView };

interface OrderRowProps {
	order: OrderListItemView;
	index: number;
	open: boolean;
	onToggle: () => void;
	detail: OrderDetailState;
	onRetry: () => void;
	onCancelled: (status: OrderStatus) => void;
}

function pluralizeItems(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "позиция";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "позиции";
	return "позиций";
}

/**
 * Этап заказа в свёрнутой строке: «3 из 6».
 *
 * Считается тем же сценарием, что и полный путь в раскрытии
 * (buildOrderTimeline), но БЕЗ истории статусов — её в списке нет и грузить её
 * ради одной цифры незачем. Без истории функция опирается на положение
 * текущего статуса в сценарии, а это ровно то, что здесь нужно.
 *
 * Сценарий зависит от способа получения и способа оплаты: у курьера шесть
 * шагов, у ПВЗ семь, а оплата по счёту добавляет ещё один. Поэтому знаменатель
 * у разных заказов разный — и это честно: «5 из 7» и «5 из 6» действительно
 * разные состояния.
 */
function resolveOrderProgress(order: OrderListItemView) {
	if (isTerminalStatus(order.status)) return null;

	const timeline = buildOrderTimeline({
		status: order.status,
		deliveryMethod: order.deliveryMethod,
		paymentMethod: order.paymentMethod,
		statusHistory: [],
	});

	const index = timeline.findIndex((step) => step.state === "current");
	if (index < 0 || timeline.length === 0) return null;

	return { step: index + 1, total: timeline.length };
}

/**
 * Заказ в списке: свёрнутая строка и раскрытие подробностей на месте.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ВИДНО БЕЗ ЕДИНОГО НАЖАТИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Номер, дата, способ получения, состав по именам позиций, статус словом со
 * значком, этап пути, итоговая сумма и объём заказа. Этого достаточно, чтобы
 * найти нужный заказ и понять, что с ним, — а раскрытие нужно только тем, кто
 * хочет проверить расчёт, адрес или состав подробно.
 *
 * Раньше в строке было четыре факта из восьми, а состав, доставка и расчёт
 * жили за модальным окном: чтобы сравнить два заказа, окно приходилось
 * открывать и закрывать.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУПНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Раскрытие — штатный disclosure: кнопка с aria-expanded и aria-controls,
 * область с role="region", подписанная номером заказа. Вся шапка и есть
 * кнопка — целиться в маленькую стрелку не нужно ни мышью, ни пальцем.
 *
 * Подробности грузятся по первому раскрытию и остаются в памяти: повторное
 * открытие того же заказа не идёт на сервер.
 */
export function OrderRow({
	order,
	index,
	open,
	onToggle,
	detail,
	onRetry,
	onCancelled,
}: OrderRowProps) {
	const progress = resolveOrderProgress(order);
	const view = ORDER_STATUS_VIEW[order.status];
	const bodyId = `order-panel-${order.id}`;
	const titleId = `order-title-${order.id}`;

	const restCount = order.itemsCount - order.itemsPreview.length;
	const preview = order.itemsPreview
		.map((item) => `${item.name} ×${item.quantity}`)
		.join(", ");

	return (
		<li
			className={`${styles.order} ${styles.orderEnter}`}
			data-open={open || undefined}
			style={{ "--i": index } as CSSProperties}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={bodyId}
				className={styles.head}
			>
				<span className={styles.headMain}>
					<span className={styles.orderNumber} id={titleId}>
						<span className={styles.orderNumberPrefix}>Заказ №</span>
						{order.orderNumber}
					</span>

					<span className={styles.orderMeta}>
						<span>{formatOrderDate(order.createdAt)}</span>
						<span className={styles.orderMetaDot} aria-hidden />
						<span>{DELIVERY_METHOD_LABELS[order.deliveryMethod]}</span>
					</span>

					{preview && (
						<span className={styles.orderItems}>
							{preview}
							{restCount > 0 && (
								<span className={styles.orderItemsRest}>
									{" "}
									и ещё {restCount} {pluralizeItems(restCount)}
								</span>
							)}
						</span>
					)}
				</span>

				<span className={styles.headStatus}>
					<OrderStatusBadge status={order.status} />

					{progress ? (
						<span className={styles.progress}>
							{/* Полоса — только иллюстрация доли: значение уже сказано
							    словами справа, и объявлять его дважды не нужно. */}
							<span className={styles.progressTrack} aria-hidden>
								<span
									className={`${styles.progressBar} ${
										view.tone === "action" ? styles.progressBarAction : ""
									}`}
									style={{
										width: `${(progress.step / progress.total) * 100}%`,
									}}
								/>
							</span>
							<span className={styles.progressLabel}>
								этап {progress.step} из {progress.total}
							</span>
						</span>
					) : null}
				</span>

				<span className={styles.headMoney}>
					<span className={styles.total}>{formatPrice(order.total)}</span>
					<span className={styles.totalNote}>
						{order.itemsCount} {pluralizeItems(order.itemsCount)} ·{" "}
						{order.totalItems} шт.
					</span>
				</span>

				<span className={styles.headToggle} aria-hidden>
					<ChevronDown size={18} />
				</span>
			</button>

			<div
				id={bodyId}
				role="region"
				aria-labelledby={titleId}
				// Закрытая область остаётся в разметке — иначе оборвалась бы
				// анимация сворачивания, — но помечена inert: её нет ни в обходе
				// табом, ни в дереве доступности. Тот же приём, что у поповеров
				// каталога и у нижнего листа.
				inert={!open}
				className={styles.panel}
			>
				<div className={styles.panelInner}>
					{detail.kind === "ready" ? (
						<OrderDetailContent
							detail={detail.detail}
							onCancelled={onCancelled}
						/>
					) : detail.kind === "error" ? (
						<div className={styles.panelBody}>
							<p
								role="alert"
								className={`${styles.notice} ${styles.noticeError}`}
							>
								<AlertCircle
									size={15}
									aria-hidden
									className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
								/>
								{detail.message}
							</p>
							<div className={styles.actions}>
								<button
									type="button"
									onClick={onRetry}
									className={`${styles.btn} ${styles.btnQuiet}`}
								>
									<RotateCcw size={15} aria-hidden />
									Повторить
								</button>
							</div>
						</div>
					) : (
						<DetailSkeleton />
					)}
				</div>
			</div>
		</li>
	);
}

/**
 * Заглушка подробностей.
 *
 * Повторяет геометрию настоящего содержимого — путь, состав, две колонки
 * данных, — поэтому в момент подстановки список не дёргается: строки ниже
 * остаются на своих местах.
 */
function DetailSkeleton() {
	return (
		<div className={styles.panelBody} aria-hidden="true">
			<div className="flex flex-col gap-[0.75rem]">
				{Array.from({ length: 3 }, (_, i) => (
					<div key={i} className="flex items-center gap-[0.75rem]">
						<span className="size-6 shrink-0 animate-pulse rounded-full bg-[var(--surface-secondary)]" />
						<span className={`${styles.skeletonLine} w-[40%] animate-pulse`} />
					</div>
				))}
			</div>

			<div className="flex flex-col gap-[0.85rem]">
				{Array.from({ length: 2 }, (_, i) => (
					<div key={i} className="flex items-center gap-[0.85rem]">
						<span className="size-[3.25rem] shrink-0 animate-pulse rounded-[var(--radius-sm)] bg-[var(--media-plate)]" />
						<span className="flex flex-1 flex-col gap-2">
							<span
								className={`${styles.skeletonLine} w-[55%] animate-pulse`}
							/>
							<span
								className={`${styles.skeletonLine} w-[30%] animate-pulse`}
							/>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export default OrderRow;
