"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import type { CartUnavailableItem, CartValidationIssue } from "../types";
import styles from "./Cart.module.css";

/**
 * Служебные полосы над списком: то, что случилось с корзиной без участия
 * пользователя, и то, что мешает оформить заказ.
 *
 * Все три сообщения стоят НАД списком, а не всплывают тостами: тост исчезает
 * через несколько секунд, а «товар сняли с продажи» и «партия меньше
 * минимальной» — это состояние корзины, и оно обязано быть видно ровно
 * столько, сколько существует.
 */

export function CartUnavailableNotice({
	items,
}: {
	items: CartUnavailableItem[];
}) {
	if (items.length === 0) return null;

	return (
		<div className={styles.notice} role="status">
			<AlertTriangle size={15} className={styles.noticeIcon} aria-hidden />
			<span>
				{items.length === 1
					? "Один товар больше не продаётся и не войдёт в заказ:"
					: `${items.length} товара больше не продаются и не войдут в заказ:`}
				<ul className={styles.noticeList}>
					{items.map((item) => (
						<li key={item.productId}>{item.title ?? "товар снят с продажи"}</li>
					))}
				</ul>
			</span>
		</div>
	);
}

export function CartValidationNotice({
	issues,
}: {
	issues: CartValidationIssue[];
}) {
	if (issues.length === 0) return null;

	return (
		<div className={styles.notice} role="status">
			<AlertTriangle size={15} className={styles.noticeIcon} aria-hidden />
			<span>
				{issues.length === 1
					? "Количество меньше минимальной партии:"
					: "Количество меньше минимальной партии у нескольких позиций:"}
				<ul className={styles.noticeList}>
					{issues.map((issue) => (
						<li key={issue.productId}>
							«{issue.productTitle}» — {issue.currentQuantity} шт. из{" "}
							{issue.minOrderQuantity}
						</li>
					))}
				</ul>
			</span>
		</div>
	);
}

export function CartErrorNotice({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		// alert, а не status: сбой требует внимания сразу, а не при следующей
		// паузе в речи скринридера.
		<div className={styles.notice} data-tone="error" role="alert">
			<WifiOff size={15} className={styles.noticeIcon} aria-hidden />
			<span>
				{message}
				<button type="button" className={styles.noticeAction} onClick={onRetry}>
					Повторить
				</button>
			</span>
		</div>
	);
}
