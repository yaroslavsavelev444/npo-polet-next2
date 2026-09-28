"use client";

/**
 * Действия для товара, который сейчас нельзя купить.
 *
 * Раньше на его месте стояла неактивная кнопка со статусом — тупик: товар
 * виден, но сделать с ним нечего. Теперь два понятных пути:
 *
 *  • «Сообщить о поступлении» — только для «Нет в наличии»: товар вернётся,
 *    и покупатель узнает об этом из колокольчика на сайте. Для «Снят с
 *    производства» эта кнопка не показывается: он не вернётся, и обещать
 *    уведомление значило бы обмануть.
 *  • «Оставить заявку» — связаться с продавцом по этому товару: сроки
 *    поставки, остатки, замена.
 *
 * Ни одна кнопка не залита акцентом и не несёт иконку корзины: оранжевая
 * заливка на сайте означает «купить», и недоступный товар не должен её
 * имитировать.
 *
 * Раскладки — как у ProductQuantitySelector:
 *  • "card" — одна кнопка во всю ширину (узкая колонка сетки, липкая
 *    панель): подписка, если товар может вернуться, иначе заявка;
 *  • "full" — страница товара: статус словами и обе кнопки.
 */

import {
	Bell,
	BellOff,
	BellRing,
	Loader2,
	MessageSquareText,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { useRestockSubscription } from "../hooks/useRestockSubscription";
import { PRODUCT_STATUS_LABELS } from "../lib/status";
import type { ProductCardData } from "../types";
import styles from "./ProductCard.module.css";
import { ProductRequestDialog } from "./ProductRequestDialog";

interface Props {
	product: ProductCardData;
	minOrderQuantity: number;
	variant: "card" | "full";
}

export function UnavailableProductActions({
	product,
	minOrderQuantity,
	variant,
}: Props) {
	const [requestOpen, setRequestOpen] = useState(false);
	// Окно монтируется только на время показа. Modal держит <dialog> в DOM и
	// закрытым, и в сетке каталога каждая карточка недоступного товара несла
	// бы свою невидимую форму — десятки лишних полей в дереве доступности.
	// Размонтирование — после анимации закрытия (onClosed), а не сразу.
	const [requestMounted, setRequestMounted] = useState(false);
	const canWaitForRestock = product.status === "out_of_stock";

	const requestDialog = requestMounted ? (
		<ProductRequestDialog
			open={requestOpen}
			onClose={() => setRequestOpen(false)}
			onClosed={() => setRequestMounted(false)}
			product={{ id: product.id, title: product.title }}
			defaultQuantity={Math.max(minOrderQuantity, 1)}
		/>
	) : null;

	const requestButton = (
		<button
			type="button"
			onClick={() => {
				setRequestMounted(true);
				setRequestOpen(true);
			}}
			aria-haspopup="dialog"
			aria-label={`Оставить заявку на «${product.title}»`}
			className={cn(styles.cta, styles.ctaQuiet)}
		>
			<MessageSquareText size={15} aria-hidden="true" className="shrink-0" />
			<span className="truncate">Оставить заявку</span>
		</button>
	);

	if (variant === "card") {
		return (
			<>
				{canWaitForRestock ? (
					<RestockButton product={product} compact={variant === "card"} />
				) : (
					requestButton
				)}
				{requestDialog}
			</>
		);
	}

	return (
		<div className="flex w-full flex-col gap-2">
			<p className="text-[13px] leading-snug text-[var(--text-secondary)]">
				<span className="font-medium text-[var(--text-primary)]">
					{PRODUCT_STATUS_LABELS[product.status]}.
				</span>{" "}
				{canWaitForRestock
					? "Сообщим, когда товар появится, или оставьте заявку."
					: "Оставьте заявку — менеджер предложит варианты."}
			</p>
			<div className="flex w-full flex-wrap gap-2">
				{canWaitForRestock && (
					<div className="min-w-[10rem] flex-1">
						<RestockButton product={product} compact={false} />
					</div>
				)}
				<div className="min-w-[10rem] flex-1">{requestButton}</div>
			</div>
			{requestDialog}
		</div>
	);
}

/**
 * Кнопка подписки на поступление. Подписанное состояние устроено как «В
 * корзине»: это состояние, а не призыв, поэтому показывается спокойно, а
 * наведение переключает подпись на отмену. Классы ctaInCart* здесь
 * переиспользованы намеренно — это тот же паттерн «состояние + отмена».
 */
function RestockButton({
	product,
	compact,
}: {
	product: ProductCardData;
	/**
	 * Узкая колонка сетки (на телефоне кнопка ~150 px): «Сообщить о
	 * поступлении» туда не помещается и обрезалась бы многоточием. Короткая
	 * подпись с колокольчиком читается однозначно, полное название действия
	 * остаётся в aria-label.
	 */
	compact: boolean;
}) {
	const { isSubscribed, isPending, toggle } = useRestockSubscription(
		product.id,
		product.title,
	);

	if (isSubscribed) {
		return (
			<button
				type="button"
				disabled={isPending}
				aria-busy={isPending}
				onClick={() => void toggle()}
				aria-label={`Не сообщать о поступлении «${product.title}»`}
				className={cn(styles.cta, styles.ctaInCart)}
			>
				<span className={styles.ctaInCartIdle}>
					<BellRing size={15} aria-hidden="true" className="shrink-0" />
					<span className="truncate">
						{compact ? "Сообщим" : "Ждём поступления"}
					</span>
				</span>
				<span className={styles.ctaInCartHover}>
					<BellOff size={15} aria-hidden="true" className="shrink-0" />
					<span className="truncate">Не сообщать</span>
				</span>
			</button>
		);
	}

	return (
		<button
			type="button"
			disabled={isPending}
			aria-busy={isPending}
			onClick={() => void toggle()}
			aria-label={`Сообщить о поступлении «${product.title}»`}
			className={cn(styles.cta, styles.ctaQuiet)}
		>
			{isPending ? (
				<Loader2
					size={15}
					aria-hidden="true"
					className="shrink-0 animate-spin"
				/>
			) : (
				<Bell size={15} aria-hidden="true" className="shrink-0" />
			)}
			<span className="truncate">
				{compact ? "Сообщить" : "Сообщить о поступлении"}
			</span>
		</button>
	);
}
