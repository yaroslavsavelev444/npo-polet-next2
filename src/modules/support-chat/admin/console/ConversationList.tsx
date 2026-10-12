"use client";

import { useEffect, useMemo, useState } from "react";
import { SUPPORT_TOPICS } from "../../lib/constants";
import type { StaffConversationDTO } from "../../lib/events";
import styles from "./console.module.css";
import { shortTime, waitingFor, waitingMinutes } from "./format";
import { compareForTab, isUnreadForStaff, type StaffTab } from "./state";

const TABS: { value: StaffTab; label: string }[] = [
	{ value: "mine", label: "Мои" },
	{ value: "queue", label: "Очередь" },
	{ value: "open", label: "Все открытые" },
	{ value: "snoozed", label: "Отложенные" },
	{ value: "resolved", label: "Закрытые" },
];

const TOPIC_LABEL = Object.fromEntries(
	SUPPORT_TOPICS.map((t) => [t.value, t.label]),
);

/**
 * Левая колонка: вкладки и список диалогов. Порядок — как у сервера: дольше
 * всех ждёт ответа — выше. Таймер ожидания краснеет после срока ответа.
 */
export function ConversationList({
	tab,
	conversations,
	selectedId,
	typing,
	slaMinutes,
	onTab,
	onSelect,
}: {
	tab: StaffTab;
	conversations: StaffConversationDTO[];
	selectedId: number | null;
	typing: Record<number, number>;
	slaMinutes: number;
	onTab: (tab: StaffTab) => void;
	onSelect: (id: number) => void;
}) {
	const [filter, setFilter] = useState("");
	const [now, setNow] = useState(() => Date.now());

	// Таймеры ожидания идут сами — раз в 30 секунд достаточно.
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 30_000);
		return () => window.clearInterval(timer);
	}, []);

	const visible = useMemo(() => {
		const query = filter.trim().toLowerCase();
		const sorted = [...conversations].sort(compareForTab(tab));
		if (!query) return sorted;
		// Поиск — по покупателю и меткам. По тексту переписки нельзя: в базе
		// она зашифрована, а расшифровывать все диалоги ради поиска — значит
		// держать их открытыми.
		return sorted.filter((c) =>
			[c.customer?.name, c.customer?.email, String(c.id), ...c.tags]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(query)),
		);
	}, [conversations, filter, tab]);

	return (
		<nav className={styles.list} aria-label="Диалоги">
			<div className={styles.tabs} role="tablist">
				{TABS.map((t) => (
					<button
						key={t.value}
						type="button"
						role="tab"
						aria-selected={tab === t.value}
						className={tab === t.value ? styles.tabActive : styles.tab}
						onClick={() => onTab(t.value)}
					>
						{t.label}
					</button>
				))}
			</div>
			<input
				className={styles.search}
				type="search"
				placeholder="Покупатель, email, метка, №"
				value={filter}
				onChange={(event) => setFilter(event.target.value)}
				aria-label="Фильтр диалогов"
			/>
			<ul className={styles.listItems}>
				{visible.length === 0 && <li className={styles.empty}>Здесь пусто</li>}
				{visible.map((c) => {
					const unread = isUnreadForStaff(c);
					const waiting = waitingFor(c.awaitingReplySince, now);
					const overdue =
						waitingMinutes(c.awaitingReplySince, now) > slaMinutes;
					const isTyping = (typing[c.id] ?? 0) > now;
					return (
						<li key={c.id}>
							<button
								type="button"
								className={[
									styles.row,
									c.id === selectedId ? styles.rowSelected : "",
									unread ? styles.rowUnread : "",
								].join(" ")}
								onClick={() => onSelect(c.id)}
								aria-current={c.id === selectedId ? "true" : undefined}
							>
								<span className={styles.rowTop}>
									<span className={styles.rowName}>
										{c.customer?.name || "Аккаунт удалён"}
									</span>
									<span className={styles.rowTime}>
										{shortTime(c.lastMessageAt)}
									</span>
								</span>
								<span className={styles.rowPreview}>
									{isTyping ? (
										<em>печатает…</em>
									) : (
										(c.lastMessagePreview ?? "—")
									)}
								</span>
								<span className={styles.rowMeta}>
									<span>{TOPIC_LABEL[c.topic] ?? c.topic}</span>
									{c.assignee ? (
										<span>· {c.assignee.name}</span>
									) : (
										<span>· в очереди</span>
									)}
									{waiting && c.status === "open" && (
										<span className={overdue ? styles.overdue : styles.waiting}>
											⏱ {waiting}
										</span>
									)}
									{unread && (
										<span
											className={styles.dot}
											role="img"
											aria-label="Непрочитано"
										/>
									)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
