"use client";

import { AlertTriangle, WifiOff, X } from "lucide-react";
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

/**
 * Полоса «эти товары больше нельзя заказать».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЕЁ МОЖНО ЗАКРЫТЬ, А ПОМЕТКУ НА ТОВАРЕ — НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Полоса — это НОВОСТЬ: «пока вы отсутствовали, вот с этим случилось вот
 * что». Новость прочитывают один раз, и держать её на экране вечно — значит
 * мешать разбирать остальную корзину. А вот сам факт недоступности —
 * СОСТОЯНИЕ: строка товара остаётся перечёркнутой и подписанной всегда, и
 * закрыть её нельзя (см. CartUnavailableLineItem). Поэтому закрытие полосы
 * ничего не прячет: оно лишь убирает повтор того, что уже написано у каждой
 * строки.
 *
 * Закрытие запоминается по id товаров (см. lib/unavailable-dismissals),
 * поэтому полоса не возвращается ни при перерисовке, ни при перезагрузке
 * страницы — но возвращается, если с продажи снимут ЕЩЁ один товар.
 */
export function CartUnavailableNotice({
	items,
	onDismiss,
}: {
	items: CartUnavailableItem[];
	onDismiss?: () => void;
}) {
	if (items.length === 0) return null;

	return (
		<div className={styles.notice} role="status">
			<AlertTriangle size={15} className={styles.noticeIcon} aria-hidden />
			<span className={styles.noticeText}>
				{items.length === 1
					? "Товар больше недоступен для заказа и не войдёт в заказ:"
					: `${items.length} товара(ов) больше недоступны для заказа и не войдут в заказ:`}
				<ul className={styles.noticeList}>
					{items.map((item) => (
						<li key={item.productId}>
							{item.title ?? "Товар снят с продажи"} — {item.statusLabel}
						</li>
					))}
				</ul>
				<span className={styles.noticeHint}>
					Позиции остались в корзине, помеченными. Уберите их, чтобы оформить
					заказ.
				</span>
			</span>
			{onDismiss && (
				<button
					type="button"
					className={styles.noticeClose}
					onClick={onDismiss}
					aria-label="Скрыть уведомление о недоступных товарах"
				>
					<X size={14} aria-hidden />
				</button>
			)}
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
