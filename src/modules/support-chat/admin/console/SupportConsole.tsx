"use client";

import { useEffect, useMemo, useState } from "react";
import { CLIENT_EVENTS } from "../../lib/events";
import { ContextPanel } from "./ContextPanel";
import { ConversationList } from "./ConversationList";
import { ConversationPane } from "./ConversationPane";
import styles from "./console.module.css";
import {
	notificationsSupported,
	requestNotificationPermission,
} from "./signals";
import { belongsToTab, isUnreadForStaff } from "./state";
import { useConsole } from "./useConsole";

/**
 * Консоль поддержки: список диалогов, переписка, данные покупателя.
 *
 * Горячие клавиши (Alt / Option):
 *   Alt+N — следующий непрочитанный, Alt+T — взять себе, Alt+R — закрыть.
 */
export function SupportConsole({
	me,
	socketUrl,
	siteUrl,
	initialConversationId,
	slaMinutes,
}: {
	me: { adminId: number; name: string };
	socketUrl: string | null;
	siteUrl: string;
	initialConversationId: number | null;
	/** Срок первого ответа из настроек — таймер ожидания краснеет после него. */
	slaMinutes: number;
}) {
	const api = useConsole({
		adminId: me.adminId,
		socketUrl,
		initialConversationId,
	});
	const { state } = api;
	const [toast, setToast] = useState<string | null>(null);
	const [permission, setPermission] = useState<
		NotificationPermission | "unsupported"
	>("default");

	useEffect(() => {
		setPermission(
			notificationsSupported() ? Notification.permission : "unsupported",
		);
	}, []);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(null), 5_000);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const listed = useMemo(
		() =>
			state.tabIds
				.map((id) => state.conversations[id])
				.filter((c) => c && belongsToTab(c, state.tab, me.adminId)),
		[state.tabIds, state.conversations, state.tab, me.adminId],
	);
	const selected =
		state.selectedId !== null
			? state.conversations[state.selectedId]
			: undefined;
	const myStatus =
		state.agents.find((a) => a.adminId === me.adminId)?.status ?? "offline";

	// ── Горячие клавиши ────────────────────────────────────────────────────
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!event.altKey || event.ctrlKey || event.metaKey) return;
			if (event.code === "KeyN") {
				event.preventDefault();
				const next = listed.find(
					(c) => isUnreadForStaff(c) && c.id !== state.selectedId,
				);
				if (next) api.select(next.id);
			} else if (
				event.code === "KeyT" &&
				selected?.status === "open" &&
				selected.assigneeId === null
			) {
				event.preventDefault();
				void api
					.request(CLIENT_EVENTS.staffClaim, { conversationId: selected.id })
					.catch((error: Error) => setToast(error.message));
			} else if (event.code === "KeyR" && selected?.status === "open") {
				event.preventDefault();
				void api
					.request(CLIENT_EVENTS.staffResolve, { conversationId: selected.id })
					.catch((error: Error) => setToast(error.message));
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [api, listed, selected, state.selectedId]);

	return (
		<div className={styles.console}>
			<div className={styles.topBar}>
				<h1 className={styles.heading}>Чат поддержки</h1>
				<a href="/admin/support/reports" className={styles.topLink}>
					Отчёты
				</a>
				<span
					className={`${styles.connection} ${state.connection === "online" ? styles.connectionOk : styles.connectionBad}`}
					role="status"
				>
					{state.connection === "online"
						? "На связи"
						: state.connection === "connecting"
							? "Подключение…"
							: state.connection === "revoked"
								? "Сессия завершена — войдите снова"
								: "Нет связи, переподключаемся…"}
				</span>
				<div className={styles.presence} role="group" aria-label="Мой статус">
					{(["available", "away"] as const).map((status) => (
						<button
							key={status}
							type="button"
							aria-pressed={myStatus === status}
							className={myStatus === status ? styles.tabActive : styles.tab}
							onClick={() =>
								void api
									.request(CLIENT_EVENTS.staffPresence, { status })
									.catch((error: Error) => setToast(error.message))
							}
						>
							{status === "available" ? "На месте" : "Отошёл"}
						</button>
					))}
				</div>
				{permission === "default" && (
					<button
						type="button"
						className={styles.secondary}
						onClick={() =>
							void requestNotificationPermission().then(setPermission)
						}
					>
						Включить уведомления
					</button>
				)}
			</div>

			<div className={styles.layout}>
				<ConversationList
					tab={state.tab}
					conversations={listed}
					selectedId={state.selectedId}
					typing={state.customerTyping}
					slaMinutes={slaMinutes}
					onTab={api.setTab}
					onSelect={api.select}
				/>
				{selected ? (
					<>
						<ConversationPane
							api={api}
							conversation={selected}
							me={me}
							siteUrl={siteUrl}
							onError={setToast}
						/>
						<ContextPanel
							conversationId={selected.id}
							onOpenConversation={api.select}
						/>
					</>
				) : (
					<div className={styles.placeholder}>
						<p>Выберите диалог слева.</p>
						<p className={styles.muted}>Alt+N — следующий непрочитанный.</p>
					</div>
				)}
			</div>

			{toast && (
				<div className={styles.toast} role="alert">
					{toast}
				</div>
			)}
		</div>
	);
}
