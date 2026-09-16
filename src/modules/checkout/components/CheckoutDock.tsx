"use client";

import { ArrowDown } from "lucide-react";
import { type RefObject, useEffect, useState } from "react";
import { formatPrice } from "@/modules/productCard";
import styles from "./Checkout.module.css";

interface Props {
	total: number;
	/** Идёт пересчёт — сумма относится к прошлому составу заказа. */
	isStale: boolean;
	/** Панель итога. Пока она на экране, полоса не нужна. */
	panelRef: RefObject<HTMLDivElement | null>;
	/** Увести к панели итога и поставить фокус на кнопку подтверждения. */
	onJump: () => void;
}

/**
 * Полоса итога у нижнего края экрана (только телефон и планшет).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗДЕСЬ НЕТ ВТОРОЙ КНОПКИ «ПОДТВЕРДИТЬ ЗАКАЗ»
 * ────────────────────────────────────────────────────────────────────────────
 * Липкая кнопка оформления — привычный приём, и именно поэтому он опасен
 * ровно здесь: две кнопки с одинаковой подписью на одном экране создают два
 * места, где создаётся заказ, и ни одного способа понять, что они делают одно
 * и то же. При медленной сети человек жмёт одну, не видит отклика, жмёт
 * вторую — и защита от дубля начинает работать не на уровне интерфейса, а на
 * уровне гонки запросов.
 *
 * Полоса отвечает на другой вопрос — «сколько сейчас выходит» — и ведёт к
 * единственной настоящей кнопке. Сумма в ней живая: она меняется вместе с
 * количеством и промокодом, поэтому итог не теряется из виду ни на одном
 * экране формы.
 *
 * Полоса исчезает, когда панель итога и так видна: дублировать то, что перед
 * глазами, значит отнимать у экрана строку впустую.
 */
export function CheckoutDock({ total, isStale, panelRef, onJump }: Props) {
	const [panelVisible, setPanelVisible] = useState(false);

	useEffect(() => {
		const node = panelRef.current;
		if (!node) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) setPanelVisible(entry.isIntersecting);
			},
			// Панель считается видимой, когда показалась её верхняя треть: к
			// этому моменту итог уже читается, и полоса становится лишней.
			{ threshold: 0, rootMargin: "0px 0px -35% 0px" },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [panelRef]);

	if (panelVisible) return null;

	return (
		<div className={styles.dock}>
			<p className={styles.dockMoney}>
				<span className={styles.dockLabel}>к оплате</span>
				<span
					className={`${styles.dockValue} ${isStale ? styles.sumStale : ""}`}
				>
					{formatPrice(total)}
				</span>
			</p>

			<button type="button" className={styles.dockButton} onClick={onJump}>
				<ArrowDown size={15} aria-hidden />
				Проверить заказ
			</button>
		</div>
	);
}
