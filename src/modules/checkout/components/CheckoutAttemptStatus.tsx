"use client";

import Link from "next/link";
import styles from "./Checkout.module.css";

export type CheckoutRecovery =
	| { state: "idle" }
	| { state: "checking" }
	| { state: "unknown" }
	| { state: "auth" }
	| { state: "closed" }
	| { state: "complete"; orderNumber: string }
	| { state: "removed"; orderNumber: string };

export function CheckoutAttemptStatus({
	recovery,
	onCheck,
	onSignIn,
}: {
	recovery: CheckoutRecovery;
	onCheck: () => void;
	onSignIn: () => void;
}) {
	const messages = {
		idle: "",
		checking: "Проверяем, оформился ли заказ…",
		unknown:
			"Пока не удалось проверить заказ. Проверьте соединение и повторите проверку.",
		auth: "Войдите в аккаунт, чтобы проверить, оформился ли заказ.",
		closed:
			"Заказ не оформлен. Проверьте товары и данные перед новым подтверждением.",
		complete: "Заказ оформлен. Открываем карточку заказа…",
	};
	const message =
		recovery.state === "removed"
			? `Заказ №${recovery.orderNumber} был оформлен, но его карточка больше недоступна.`
			: messages[recovery.state];

	return (
		<>
			<p role="status" className={message ? styles.ctaNote : undefined}>
				{message}
			</p>
			{recovery.state === "unknown" && (
				<button type="button" className={styles.cta} onClick={onCheck}>
					Проверить статус заказа
				</button>
			)}
			{recovery.state === "auth" && (
				<button type="button" className={styles.cta} onClick={onSignIn}>
					Войти и проверить заказ
				</button>
			)}
			{recovery.state === "complete" && (
				<Link
					href={`/orders/${encodeURIComponent(recovery.orderNumber)}`}
					className={styles.ctaLink}
				>
					Открыть заказ
				</Link>
			)}
			{recovery.state === "removed" && (
				<Link href="/orders" className={styles.ctaLink}>
					Мои заказы
				</Link>
			)}
		</>
	);
}
