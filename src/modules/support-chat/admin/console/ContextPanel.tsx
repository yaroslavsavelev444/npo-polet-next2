"use client";

import { useEffect, useState } from "react";
import { ORDER_STATUS_LABELS } from "../../../orders/lib/status.groups";
import type { CustomerContextDTO } from "../../server/customer-context";
import styles from "./console.module.css";
import { fullTime, money, shortTime } from "./format";

/**
 * Запрет писать в чат — против спама и оскорблений; остальной аккаунт
 * покупателя не затрагивается. Подтверждение — чтобы не нажать случайно.
 */
function ChatBanToggle({
	userId,
	banned,
	onChange,
}: {
	userId: number;
	banned: boolean;
	onChange: (banned: boolean) => void;
}) {
	const [busy, setBusy] = useState(false);
	const toggle = async () => {
		const next = !banned;
		if (
			next &&
			!window.confirm(
				"Запретить покупателю писать в чат? Его окно чата закроется.",
			)
		)
			return;
		setBusy(true);
		try {
			const response = await fetch(
				`/api/support/staff/customers/${userId}/chat-ban`,
				{
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ banned: next }),
				},
			);
			if (response.ok) onChange(next);
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			{banned && <p className={styles.overdue}>Писать в чат запрещено</p>}
			<button
				type="button"
				className={styles.linkButton}
				disabled={busy}
				onClick={() => void toggle()}
			>
				{banned ? "Разрешить писать в чат" : "Запретить писать в чат"}
			</button>
		</>
	);
}

/**
 * Правая колонка: кто пишет. Профиль, организации с ИНН, последние заказы,
 * корзина, прошлые диалоги — чтобы не переключаться в другие разделы
 * админки посреди ответа. Ссылки открывают записи в админке.
 */
export function ContextPanel({
	conversationId,
	onOpenConversation,
}: {
	conversationId: number;
	onOpenConversation: (id: number) => void;
}) {
	const [context, setContext] = useState<CustomerContextDTO | null>(null);
	const [state, setState] = useState<"loading" | "ready" | "error">("loading");

	useEffect(() => {
		let cancelled = false;
		setState("loading");
		fetch(`/api/support/staff/conversations/${conversationId}/context`, {
			credentials: "same-origin",
			cache: "no-store",
		})
			.then((response) =>
				response.ok ? response.json() : Promise.reject(response.status),
			)
			.then((data: { context: CustomerContextDTO | null }) => {
				if (cancelled) return;
				setContext(data.context);
				setState("ready");
			})
			.catch(() => !cancelled && setState("error"));
		return () => {
			cancelled = true;
		};
	}, [conversationId]);

	if (state === "loading")
		return <aside className={styles.context}>Загрузка…</aside>;
	if (state === "error")
		return (
			<aside className={styles.context}>
				Не удалось загрузить данные покупателя
			</aside>
		);
	if (!context)
		return <aside className={styles.context}>Аккаунт покупателя удалён</aside>;

	const { customer, companies, orders, cart, otherConversations } = context;
	return (
		<aside className={styles.context} aria-label="О покупателе">
			<section>
				<h3>Покупатель</h3>
				<a
					href={customer.adminUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.contextName}
				>
					{customer.name || "Без имени"}
				</a>
				<a href={`mailto:${customer.email}`}>{customer.email}</a>
				{customer.status !== "active" && (
					<p className={styles.overdue}>Статус: {customer.status}</p>
				)}
				<ChatBanToggle
					userId={customer.id}
					banned={customer.chatBanned}
					onChange={(banned) =>
						setContext((current) =>
							current
								? {
										...current,
										customer: { ...current.customer, chatBanned: banned },
									}
								: current,
						)
					}
				/>
				<p className={styles.muted}>
					С нами с {fullTime(customer.registeredAt)}
				</p>
			</section>

			{companies.length > 0 && (
				<section>
					<h3>Организации</h3>
					<ul>
						{companies.map((company) => (
							<li key={company.id}>
								<a
									href={company.adminUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									{company.name}
								</a>
								<span className={styles.muted}>
									ИНН {company.inn ?? "—"}
									{company.kpp ? ` · КПП ${company.kpp}` : ""}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			<section>
				<h3>Заказы</h3>
				{orders.length === 0 ? (
					<p className={styles.muted}>Заказов нет</p>
				) : (
					<ul>
						{orders.map((order) => (
							<li key={order.id}>
								<a
									href={order.adminUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									{order.orderNumber}
								</a>
								<span className={styles.muted}>
									{ORDER_STATUS_LABELS[
										order.status as keyof typeof ORDER_STATUS_LABELS
									] ?? order.status}
									{" · "}
									{money(order.total)} · {shortTime(order.createdAt)}
								</span>
								{order.phone && (
									<span className={styles.muted}>☎ {order.phone}</span>
								)}
							</li>
						))}
					</ul>
				)}
			</section>

			{cart.length > 0 && (
				<section>
					<h3>В корзине</h3>
					<ul>
						{cart.map((item) => (
							<li key={item.productId}>
								{item.title} × {item.quantity}
							</li>
						))}
					</ul>
				</section>
			)}

			{otherConversations.length > 0 && (
				<section>
					<h3>Прошлые диалоги</h3>
					<ul>
						{otherConversations.map((conversation) => (
							<li key={conversation.id}>
								<button
									type="button"
									className={styles.linkButton}
									onClick={() => onOpenConversation(conversation.id)}
								>
									№{conversation.id} от {shortTime(conversation.createdAt)}
								</button>
								<span className={styles.muted}>
									{conversation.status === "open" ? "открыт" : "закрыт"}
									{conversation.csatScore
										? ` · оценка ${conversation.csatScore}/5`
										: ""}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
		</aside>
	);
}
