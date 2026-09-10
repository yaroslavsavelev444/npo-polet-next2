"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/modules/productCard";
import type { CartView } from "../types";
import styles from "./Cart.module.css";

interface Props {
	discounts: CartView["discounts"];
	/** Скидка корзины в рублях — показывается, когда порог уже взят. */
	appliedAmount: number;
}

/**
 * Прогресс до скидки корзины.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ СЧИТАЕТСЯ, А ЧТО НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Ничего. Пороги, проценты и формулировки приходят готовыми из
 * discount-calculator (см. lib/discount-calculator.ts) — здесь только доля
 * пройденного пути, и та выводится из уже присланных «сколько есть» и
 * «сколько не хватает». Своей арифметики скидок у интерфейса быть не должно:
 * два независимых расчёта рано или поздно разойдутся, и корзина начнёт
 * обещать скидку, которой на оформлении не окажется.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЭТО НЕ ПРОСТО ПОЛОСКА
 * ────────────────────────────────────────────────────────────────────────────
 * Прежний баннер показывал долю без единиц: «заполнено примерно на две трети»
 * не отвечает на единственный вопрос, который тут задают — «сколько ещё
 * добавить». Поэтому справа стоит счёт в тех же единицах, в которых задан
 * порог (штуки или рубли), а полоса лишь показывает, далеко ли до цели.
 */
export function CartProgress({ discounts, appliedAmount }: Props) {
	const applied = discounts.applied[0] ?? null;
	const hint = discounts.hints[0] ?? null;

	const reached = Boolean(applied);
	const progress = reached ? 1 : hintProgress(hint);

	// Блик пробегает один раз — в тот момент, когда порог только что взят.
	// Ref, а не состояние на каждом рендере: подтверждать нужно ПЕРЕХОД, а не
	// сам факт скидки, иначе блик повторялся бы при каждом обновлении корзины.
	const wasReached = useRef(reached);
	const [celebrate, setCelebrate] = useState(false);
	useEffect(() => {
		if (reached && !wasReached.current) {
			setCelebrate(true);
			const timeout = setTimeout(() => setCelebrate(false), 1000);
			wasReached.current = reached;
			return () => clearTimeout(timeout);
		}
		wasReached.current = reached;
	}, [reached]);

	if (!applied && !hint) return null;

	return (
		<section
			className={styles.progress}
			data-reached={reached || undefined}
			aria-label="Прогресс до скидки"
		>
			<div className={styles.progressHead}>
				<p className={styles.progressMessage}>
					{reached ? (
						<>
							<strong>Скидка {applied?.discountPercent}% применена</strong> — вы
							экономите {formatPrice(appliedAmount)}
						</>
					) : (
						hint?.message
					)}
				</p>
				{!reached && hint && (
					<span className={styles.progressValue}>{formatScale(hint)}</span>
				)}
			</div>

			<div
				className={styles.progressTrack}
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress * 100)}
				aria-valuetext={
					reached
						? `Скидка ${applied?.discountPercent}% получена`
						: (hint?.message ?? undefined)
				}
			>
				<div
					className={styles.progressFill}
					style={{ width: `${Math.round(progress * 100)}%` }}
					data-celebrate={celebrate || undefined}
				/>
			</div>
		</section>
	);
}

/**
 * Доля пройденного пути. Цель — «уже есть плюс сколько не хватает»: именно так
 * порог задан в расчёте, и брать его откуда-то ещё значило бы гадать.
 *
 * Минимум 4% при непустой корзине: нулевая полоса читается как «ничего не
 * происходит», хотя первый товар уже положен.
 */
function hintProgress(
	hint: {
		needed?: { quantity?: number; amount?: number };
		current?: { quantity?: number; amount?: number };
	} | null,
): number {
	if (!hint?.needed || !hint.current) return 0;

	const current = hint.current.quantity ?? hint.current.amount ?? 0;
	const needed = hint.needed.quantity ?? hint.needed.amount ?? 0;
	const target = current + needed;
	if (target <= 0) return 0;

	return Math.min(Math.max(current / target, current > 0 ? 0.04 : 0), 1);
}

/** «8 / 10 шт.» или «42 000 ₽ / 50 000 ₽» — в тех единицах, в которых порог. */
function formatScale(hint: {
	needed?: { quantity?: number; amount?: number };
	current?: { quantity?: number; amount?: number };
}): string {
	if (hint.needed?.quantity !== undefined) {
		const current = hint.current?.quantity ?? 0;
		return `${current} / ${current + hint.needed.quantity} шт.`;
	}
	if (hint.needed?.amount !== undefined) {
		const current = hint.current?.amount ?? 0;
		return `${formatPrice(current)} / ${formatPrice(current + hint.needed.amount)}`;
	}
	return "";
}
