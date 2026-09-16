import type { CSSProperties } from "react";
import { ORDER_STATUS_LABELS } from "../../lib/status.groups";
import { ORDER_STATUS_VIEW, type OrderStatusTone } from "../../lib/status-view";
import type { OrderStatus } from "../../types";
import styles from "../Orders.module.css";

interface Props {
	status: OrderStatus;
}

/**
 * Знак состояния заказа на первом экране: окружность и символ внутри неё
 * прочерчиваются штрихом, вокруг расходятся два кольца-эха.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗНАК ЗАВИСИТ ОТ СТАТУСА
 * ────────────────────────────────────────────────────────────────────────────
 * Раньше здесь всегда рисовалась зелёная галочка — страница ведь называлась
 * «успешное оформление». Но адрес у страницы один на всю жизнь заказа, и
 * зелёная галочка над отменённым заказом означает ровно противоположное
 * правде. Теперь символ и цвет берутся из того же тона статуса, что красит
 * значок в списке заказов: галочка у оформленного и завершённого, часы у
 * ожидающего, крест у остановленного.
 *
 * Символы разные не ради разнообразия: силуэт различает состояния и при
 * дальтонизме, и на плохом экране. Плюс подпись словом в role="img" — для
 * скринридера знак не немой.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * АНИМАЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Целиком на CSS (globals.css), поэтому компонент серверный и не тянет за
 * собой ни байта клиентского кода. prefers-reduced-motion гасит движение там
 * же — знак остаётся, исчезает только его прочерчивание.
 */

/** Цвет тона. Тот же смысл, что у статусной плашки в списке заказов. */
const TONE_COLOR: Record<OrderStatusTone, string> = {
	wait: "var(--success)",
	progress: "var(--accent-light)",
	action: "var(--primary)",
	done: "var(--success)",
	stopped: "var(--error)",
};

/**
 * Символ внутри окружности. Путь рисуется в системе координат 60×60 и
 * прочерчивается штрихом, поэтому длина пути задаётся вместе с ним: от неё
 * зависит dasharray анимации.
 */
const TONE_GLYPH: Record<OrderStatusTone, { d: string; length: number }> = {
	// Галочка.
	wait: { d: "M19 30.5 L26.5 38 L41 22", length: 48 },
	done: { d: "M19 30.5 L26.5 38 L41 22", length: 48 },
	// Стрелка движения вперёд.
	progress: { d: "M21 30.5 H39 M32 23.5 L39 30.5 L32 37.5", length: 44 },
	// Восклицание: ход за покупателем.
	action: { d: "M30 19 V32 M30 40 V40.5", length: 16 },
	// Крест.
	stopped: { d: "M22 22 L38 38 M38 22 L22 38", length: 46 },
};

export function OrderStatusMark({ status }: Props) {
	const tone = ORDER_STATUS_VIEW[status].tone;
	const color = TONE_COLOR[tone];
	const glyph = TONE_GLYPH[tone];

	return (
		<div
			className={styles.mark}
			style={{ "--mark-color": color } as CSSProperties}
		>
			<span aria-hidden className={`${styles.markEcho} order-ring-echo`} />
			<span
				aria-hidden
				className={`${styles.markEcho} order-ring-echo`}
				style={{ animationDelay: "0.8s" }}
			/>
			<span aria-hidden className={styles.markGlow} />

			<div className={`${styles.markPlate} order-check-container`}>
				<svg
					viewBox="0 0 60 60"
					className={styles.markSvg}
					fill="none"
					role="img"
					aria-label={`Статус заказа: ${ORDER_STATUS_LABELS[status]}`}
				>
					<circle
						className="order-check-circle"
						cx="30"
						cy="30"
						r="26.5"
						stroke={color}
						strokeWidth="2.5"
					/>
					<path
						className="order-check-mark"
						// Длина штриха у каждого символа своя, поэтому dasharray
						// задаётся здесь, а не в общем классе: с чужой длиной
						// прочерчивание либо обрывается, либо начинается с уже
						// видимой линии.
						style={{
							strokeDasharray: glyph.length,
							strokeDashoffset: glyph.length,
						}}
						d={glyph.d}
						stroke={color}
						strokeWidth="3.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
		</div>
	);
}
