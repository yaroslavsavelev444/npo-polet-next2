"use client";

import { Banknote, Check, CreditCard, FileText, Info } from "lucide-react";
import type { ComponentType } from "react";
import { formatPrice } from "@/modules/productCard";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import { PAYMENT_OPTIONS } from "../lib/checkout-labels";
import type { CheckoutPaymentMethod } from "../types";
import styles from "./Checkout.module.css";

const ICONS: Record<
	CheckoutPaymentMethod,
	ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>
> = {
	invoice: FileText,
	self_pickup_card: CreditCard,
	self_pickup_cash: Banknote,
};

interface Props {
	value: CheckoutPaymentMethod;
	onChange: (next: CheckoutPaymentMethod) => void;
	available: CheckoutPaymentMethod[];
	error?: string;
	/** Сумма, о которой идёт речь. Показывается в пояснении под выбором. */
	total: number;
	/** Выбор сузился из-за способа доставки — это нужно объяснить. */
	limitedByDelivery: boolean;
}

/**
 * Способ оплаты.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГЛАВНОЕ, ЧЕГО НЕ ХВАТАЛО
 * ────────────────────────────────────────────────────────────────────────────
 * Ни один из способов не списывает деньги в момент оформления: заказ
 * создаётся со статусом «ожидает оплаты», а счёт или касса будут потом.
 * Раньше об этом не говорилось нигде, и кнопка «Подтвердить заказ» рядом с
 * выбранной картой честно читалась как «сейчас спишут». Поэтому под выбором
 * прямым текстом сказано, что произойдёт после нажатия и с какой суммой.
 *
 * Набор способов зависит от способа получения (см. payment-compatibility):
 * картой и наличными платят в пункте выдачи, значит при доставке этих
 * способов не существует. Несовместимый вариант не показывается вовсе — и
 * ровно поэтому список иногда состоит из одного пункта. Это тоже подписано:
 * список из одного варианта без объяснения выглядит как поломка.
 */
export function PaymentSection({
	value,
	onChange,
	available,
	error,
	total,
	limitedByDelivery,
}: Props) {
	const selected = PAYMENT_OPTIONS[value];

	return (
		<>
			<div
				id={CHECKOUT_FIELD_IDS.payment}
				role="radiogroup"
				aria-label="Способ оплаты"
				aria-invalid={error ? true : undefined}
				aria-describedby={
					error ? `${CHECKOUT_FIELD_IDS.payment}-error` : undefined
				}
				className={`${styles.options} ${error ? styles.optionsInvalid : ""}`}
			>
				{available.map((method) => {
					const copy = PAYMENT_OPTIONS[method];
					const Icon = ICONS[method];
					const isActive = value === method;

					return (
						<button
							key={method}
							type="button"
							role="radio"
							aria-checked={isActive}
							onClick={() => onChange(method)}
							data-selected={isActive || undefined}
							className={styles.option}
						>
							<span className={styles.optionIcon}>
								<Icon size={16} aria-hidden />
							</span>
							<span className={styles.optionBody}>
								<span className={styles.optionTitle}>{copy.label}</span>
								<span className={styles.optionText}>{copy.description}</span>
							</span>
							{isActive && (
								<Check
									size={15}
									strokeWidth={3}
									aria-hidden
									className={styles.optionCheck}
								/>
							)}
						</button>
					);
				})}
			</div>

			{error && (
				<p
					id={`${CHECKOUT_FIELD_IDS.payment}-error`}
					role="alert"
					className={styles.fieldError}
				>
					{error}
				</p>
			)}

			{/* Роль status: текст меняется при смене способа, и озвучить это
			    изменение нужно — но не перебивая то, что читает пользователь. */}
			<p role="status" className={`${styles.notice} ${styles.noticeInfo}`}>
				<Info size={15} aria-hidden className={styles.noticeIcon} />
				<span>
					{selected.afterSubmit}. Сейчас деньги не списываются — к оплате будет{" "}
					<strong className="tabular-nums">{formatPrice(total)}</strong>.
					{limitedByDelivery &&
						" Оплата в пункте выдачи доступна только при самовывозе."}
				</span>
			</p>
		</>
	);
}
