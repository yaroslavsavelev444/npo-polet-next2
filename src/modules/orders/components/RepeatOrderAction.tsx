"use client";

import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Loader2,
	RefreshCw,
	ShoppingCart,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCartPanel } from "@/modules/cart/store/cart-panel.store";
import type { RepeatOrderLine, RepeatOrderReport } from "@/modules/cart/types";
import { formatPrice } from "@/modules/productCard";
import styles from "./Orders.module.css";

interface Props {
	orderId: string;
	/** Главное ли это действие рядом с заказом или второстепенное. */
	variant: "primary" | "quiet";
}

type State =
	| { kind: "idle" }
	| { kind: "pending" }
	| { kind: "error"; message: string }
	| { kind: "done"; report: RepeatOrderReport };

/**
 * Что изменилось у позиции относительно заказа — словами. Пустой список —
 * позиция легла в корзину ровно как в заказе.
 */
function describeLine(line: RepeatOrderLine): string[] {
	const notes: string[] = [];

	if (line.priceChange) {
		notes.push(
			`цена ${formatPrice(line.priceChange.ordered)} → ${formatPrice(
				line.priceChange.current,
			)} за шт.`,
		);
	}

	if (line.quantityAdjustment) {
		const { reason, limit } = line.quantityAdjustment;
		notes.push(
			reason === "min_order"
				? `${line.orderedQuantity} → ${limit} шт.: минимальная партия — ${limit} шт.`
				: `${line.orderedQuantity} → ${limit} шт.: больше ${limit} шт. в один заказ не оформить`,
		);
	}

	if (line.outcome === "already_in_cart") {
		notes.push(
			`уже в корзине ${line.previousCartQuantity} шт. — количество не менялось`,
		);
	} else if (line.previousCartQuantity > 0) {
		notes.push(
			`в корзине было ${line.previousCartQuantity} шт., теперь ${line.cartQuantity} шт.`,
		);
	}

	return notes;
}

function headline(report: RepeatOrderReport): string {
	const added = report.lines.filter((line) => line.outcome === "added");
	if (report.lines.length === 0) return "Ни одну позицию добавить не удалось";
	if (added.length === 0) return "Всё из заказа уже в корзине";
	if (report.skipped.length > 0) return "Добавлена часть заказа";
	return "Заказ добавлен в корзину";
}

/**
 * «Повторить заказ» и сводка того, чем повтор отличается от заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СВОДКА ЗДЕСЬ, А НЕ В КОРЗИНЕ И НЕ ТОСТОМ
 * ────────────────────────────────────────────────────────────────────────────
 * Расхождения с заказом имеют смысл рядом с заказом: «было 1 200 ₽, стало
 * 1 350 ₽» читается, когда старая цена перед глазами. Тост исчез бы раньше,
 * чем его дочитают, а корзина про прошлый заказ ничего не знает и показывает
 * только текущее состояние. Поэтому кнопка заменяется сводкой на месте, и
 * уже из неё открывается корзина — ДО оформления человек видит всё, что
 * изменилось: цены, количества, недоступные позиции.
 *
 * Повторный запуск безопасен (сервер кладёт максимум, а не сумму), так что
 * кнопку после успеха можно было бы оставить — но нажимать её снова незачем,
 * и сводка честнее говорит, что уже произошло.
 */
export function RepeatOrderAction({ orderId, variant }: Props) {
	const repeatOrder = useCartPanel((state) => state.repeatOrder);
	const openCart = useCartPanel((state) => state.open);
	const [state, setState] = useState<State>({ kind: "idle" });
	const summaryRef = useRef<HTMLDivElement>(null);

	// Кнопка, на которой стоял фокус, исчезает — фокус переезжает на сводку,
	// иначе клавиатура и скринридер остались бы «нигде».
	useEffect(() => {
		if (state.kind === "done") summaryRef.current?.focus();
	}, [state.kind]);

	async function handleRepeat() {
		setState({ kind: "pending" });
		const result = await repeatOrder(orderId);
		setState(
			result.success
				? { kind: "done", report: result.report }
				: { kind: "error", message: result.message },
		);
	}

	if (state.kind === "done") {
		const { report } = state;
		const changed = report.lines
			.map((line) => ({ line, notes: describeLine(line) }))
			.filter((entry) => entry.notes.length > 0);
		const hasAnyInCart = report.lines.length > 0;

		return (
			<div
				ref={summaryRef}
				tabIndex={-1}
				role="status"
				className={styles.repeatSummary}
			>
				<p className={styles.repeatTitle}>
					{hasAnyInCart ? (
						<CheckCircle2 size={16} aria-hidden className={styles.repeatOk} />
					) : (
						<AlertCircle size={16} aria-hidden className={styles.repeatFail} />
					)}
					{headline(report)}
				</p>

				{hasAnyInCart && (
					<p className={styles.repeatNote}>
						Цены — по текущему каталогу, а не по заказу № {report.orderNumber}.
						Итог со скидками пересчитает корзина.
					</p>
				)}

				{changed.length > 0 && (
					<div className={styles.repeatGroup}>
						<p className={styles.repeatGroupTitle}>Отличается от заказа</p>
						<ul className={styles.repeatList}>
							{changed.map(({ line, notes }) => (
								<li key={line.productId}>
									<span className={styles.repeatItemName}>{line.title}</span>
									{notes.map((note) => (
										<span key={note} className={styles.repeatItemNote}>
											{note}
										</span>
									))}
								</li>
							))}
						</ul>
					</div>
				)}

				{report.skipped.length > 0 && (
					<div className={styles.repeatGroup}>
						<p className={styles.repeatGroupTitle}>
							<AlertTriangle
								size={13}
								aria-hidden
								className={styles.repeatFail}
							/>
							Не добавлены
						</p>
						<ul className={styles.repeatList}>
							{report.skipped.map((item, index) => (
								<li key={item.productId ?? `gone-${index}`}>
									<span className={styles.repeatItemName}>
										{item.title} ×{item.quantity}
									</span>
									<span className={styles.repeatItemNote}>
										{item.statusLabel}
									</span>
								</li>
							))}
						</ul>
					</div>
				)}

				{hasAnyInCart && (
					<button
						type="button"
						onClick={() => openCart()}
						className={`${styles.btn} ${styles.btnPrimary}`}
					>
						<ShoppingCart size={16} aria-hidden />
						Открыть корзину
					</button>
				)}
			</div>
		);
	}

	const isPending = state.kind === "pending";

	return (
		<>
			<button
				type="button"
				onClick={handleRepeat}
				disabled={isPending}
				aria-busy={isPending || undefined}
				className={`${styles.btn} ${
					variant === "primary" ? styles.btnPrimary : styles.btnQuiet
				}`}
			>
				{isPending ? (
					<Loader2 size={16} aria-hidden className={styles.spin} />
				) : (
					<RefreshCw size={16} aria-hidden />
				)}
				Повторить заказ
			</button>

			{state.kind === "error" && (
				<p role="alert" className={`${styles.notice} ${styles.noticeError}`}>
					<AlertCircle
						size={15}
						aria-hidden
						className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
					/>
					{state.message}
				</p>
			)}
		</>
	);
}

export default RepeatOrderAction;
