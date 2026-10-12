"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SUPPORT_TOPICS } from "../../lib/constants";
import { CLIENT_EVENTS, type StaffConversationDTO } from "../../lib/events";
import { Composer } from "./Composer";
import styles from "./console.module.css";
import { dayLabel, fullTime } from "./format";
import { MessageBubble } from "./MessageBubble";
import type { ConsoleApi } from "./useConsole";

const TOPIC_LABEL = Object.fromEntries(
	SUPPORT_TOPICS.map((t) => [t.value, t.label]),
);

function snoozeOptions(): { label: string; until: () => string }[] {
	const at = (date: Date) => date.toISOString();
	return [
		{ label: "На час", until: () => at(new Date(Date.now() + 60 * 60_000)) },
		{
			label: "До завтра, 9:00",
			until: () => {
				const date = new Date();
				date.setDate(date.getDate() + 1);
				date.setHours(9, 0, 0, 0);
				return at(date);
			},
		},
		{
			label: "На 3 дня",
			until: () => at(new Date(Date.now() + 3 * 24 * 60 * 60_000)),
		},
	];
}

/**
 * Центральная колонка: шапка с действиями, лента сообщений, поле ответа.
 *
 * Прочтение отмечается само, когда диалог открыт и вкладка на виду, — не по
 * факту получения: менеджер, ушедший на другую вкладку, сообщение не видел.
 */
export function ConversationPane({
	api,
	conversation,
	me,
	siteUrl,
	onError,
}: {
	api: ConsoleApi;
	conversation: StaffConversationDTO;
	me: { adminId: number; name: string };
	siteUrl: string;
	onError: (message: string) => void;
}) {
	const { state } = api;
	const messages = state.messages[conversation.id] ?? [];
	const pending = state.pending.filter(
		(p) => p.conversationId === conversation.id,
	);
	const feedRef = useRef<HTMLDivElement>(null);
	const stickToBottom = useRef(true);
	const [tagsDraft, setTagsDraft] = useState("");
	const [busy, setBusy] = useState(false);

	const agentName = (adminId: number) =>
		state.agents.find((a) => a.adminId === adminId)?.name ?? `#${adminId}`;
	const viewers = (state.viewers[conversation.id] ?? []).filter(
		(id) => id !== me.adminId,
	);
	const composing = state.composing[conversation.id] ?? [];
	const customerTyping =
		(state.customerTyping[conversation.id] ?? 0) > Date.now();

	// Прокрутка вниз — если менеджер и так был внизу; читающего историю не дёргаем.
	// biome-ignore lint/correctness/useExhaustiveDependencies: зависимости — поводы прокрутить (новое сообщение, «печатает»), а не значения внутри эффекта
	useLayoutEffect(() => {
		const feed = feedRef.current;
		if (feed && stickToBottom.current) feed.scrollTop = feed.scrollHeight;
	}, [messages.length, pending.length, customerTyping]);

	// Лента меняет высоту и без новых сообщений: появилась строка подсказок,
	// выросло поле ввода, догрузилась картинка. Кто был внизу — остаётся внизу.
	useEffect(() => {
		const feed = feedRef.current;
		if (!feed || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			if (stickToBottom.current) feed.scrollTop = feed.scrollHeight;
		});
		observer.observe(feed);
		for (const child of feed.children) observer.observe(child);
		return () => observer.disconnect();
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: новый диалог открывается с конца ленты
	useEffect(() => {
		stickToBottom.current = true;
	}, [conversation.id]);

	// Отметка прочтения — когда вкладка на виду.
	useEffect(() => {
		const markRead = () => {
			if (document.hidden) return;
			const last = messages.at(-1)?.seq ?? 0;
			if (last > conversation.staffLastReadSeq) {
				void api
					.request(CLIENT_EVENTS.conversationRead, {
						conversationId: conversation.id,
						seq: last,
					})
					.catch(() => {});
			}
		};
		markRead();
		document.addEventListener("visibilitychange", markRead);
		return () => document.removeEventListener("visibilitychange", markRead);
	}, [api, conversation.id, conversation.staffLastReadSeq, messages]);

	async function act(event: string, data: Record<string, unknown> = {}) {
		setBusy(true);
		try {
			await api.request(event, { conversationId: conversation.id, ...data });
		} catch (error) {
			onError(error instanceof Error ? error.message : "Не получилось");
		} finally {
			setBusy(false);
		}
	}

	const open = conversation.status === "open";
	const otherAgents = state.agents.filter(
		(a) => a.adminId !== conversation.assigneeId,
	);

	return (
		<section
			className={styles.pane}
			aria-label={`Диалог с ${conversation.customer?.name ?? "покупателем"}`}
		>
			<header className={styles.paneHead}>
				<div className={styles.paneTitle}>
					<h2>{conversation.customer?.name || "Аккаунт удалён"}</h2>
					<p className={styles.muted}>
						№{conversation.id} · {TOPIC_LABEL[conversation.topic]} ·{" "}
						{open
							? conversation.assignee
								? `ведёт ${conversation.assignee.name}`
								: "в очереди"
							: "закрыт"}
						{conversation.snoozedUntil && open
							? ` · отложен до ${fullTime(conversation.snoozedUntil)}`
							: ""}
					</p>
					{viewers.length > 0 && (
						<p className={styles.muted}>
							Сейчас смотрит: {viewers.map(agentName).join(", ")}
						</p>
					)}
				</div>

				<div className={styles.actions}>
					{open && conversation.assigneeId === null && (
						<button
							type="button"
							className={styles.primary}
							disabled={busy}
							onClick={() => act(CLIENT_EVENTS.staffClaim)}
						>
							Взять себе
						</button>
					)}
					{open && otherAgents.length > 0 && (
						<select
							className={styles.select}
							value=""
							disabled={busy}
							aria-label="Передать диалог"
							onChange={(event) => {
								if (event.target.value)
									void act(CLIENT_EVENTS.staffTransfer, {
										toAdminId: Number(event.target.value),
									});
							}}
						>
							<option value="">Передать…</option>
							{otherAgents.map((agent) => (
								<option key={agent.adminId} value={agent.adminId}>
									{agent.name} —{" "}
									{agent.status === "available"
										? "на месте"
										: agent.status === "away"
											? "отошёл"
											: "не в сети"}
								</option>
							))}
						</select>
					)}
					{open && (
						<select
							className={styles.select}
							value=""
							disabled={busy}
							aria-label="Отложить диалог"
							onChange={(event) => {
								const option = snoozeOptions()[Number(event.target.value)];
								if (option)
									void act(CLIENT_EVENTS.staffSnooze, {
										until: option.until(),
									});
							}}
						>
							<option value="">Отложить…</option>
							{snoozeOptions().map((option, index) => (
								<option key={option.label} value={index}>
									{option.label}
								</option>
							))}
						</select>
					)}
					{open ? (
						<button
							type="button"
							className={styles.secondary}
							disabled={busy}
							onClick={() => act(CLIENT_EVENTS.staffResolve)}
						>
							Закрыть диалог
						</button>
					) : (
						<button
							type="button"
							className={styles.secondary}
							disabled={busy}
							onClick={() => act(CLIENT_EVENTS.staffReopen)}
						>
							Переоткрыть
						</button>
					)}
				</div>

				<form
					className={styles.tags}
					onSubmit={(event) => {
						event.preventDefault();
						const tag = tagsDraft.trim();
						if (!tag) return;
						setTagsDraft("");
						void act(CLIENT_EVENTS.staffTags, {
							tags: [...conversation.tags, tag],
						});
					}}
				>
					{conversation.tags.map((tag) => (
						<span key={tag} className={styles.chip}>
							{tag}
							<button
								type="button"
								aria-label={`Убрать метку ${tag}`}
								onClick={() =>
									act(CLIENT_EVENTS.staffTags, {
										tags: conversation.tags.filter((t) => t !== tag),
									})
								}
							>
								×
							</button>
						</span>
					))}
					<input
						className={styles.tagInput}
						value={tagsDraft}
						onChange={(event) => setTagsDraft(event.target.value)}
						placeholder="+ метка"
						aria-label="Добавить метку"
						maxLength={40}
					/>
				</form>
			</header>

			<div
				className={styles.feed}
				ref={feedRef}
				onScroll={(event) => {
					const feed = event.currentTarget;
					stickToBottom.current =
						feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
				}}
				aria-live="polite"
			>
				{state.hasMore[conversation.id] && (
					<button
						type="button"
						className={styles.older}
						onClick={() => void api.loadOlder(conversation.id)}
					>
						Показать раньше
					</button>
				)}
				{messages.map((message, index) => {
					const previous = messages[index - 1];
					const newDay =
						!previous ||
						dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
					return (
						<Fragment key={message.id}>
							{newDay && (
								<div className={styles.day}>{dayLabel(message.createdAt)}</div>
							)}
							<MessageBubble
								message={message}
								readByCustomer={conversation.customerLastReadSeq >= message.seq}
							/>
						</Fragment>
					);
				})}
				{pending.map((item) => (
					<article
						key={item.clientMessageId}
						className={`${styles.bubble} ${styles.bubbleOut} ${item.kind === "note" ? styles.bubbleNote : ""} ${styles.bubblePending}`}
					>
						<p className={styles.bubbleText}>{item.body}</p>
						<footer className={styles.bubbleStatus}>
							{item.error ? (
								<>
									Не отправлено: {item.error}{" "}
									<button
										type="button"
										className={styles.linkButton}
										onClick={() =>
											api.dispatch({
												type: "pendingDrop",
												clientMessageId: item.clientMessageId,
											})
										}
									>
										Убрать
									</button>
								</>
							) : (
								"Отправляется…"
							)}
						</footer>
					</article>
				))}
				{customerTyping && (
					<p className={styles.typing}>Покупатель печатает…</p>
				)}
			</div>

			{composing.length > 0 && (
				<p className={styles.warning} role="status">
					{composing.map((c) => c.name).join(", ")}{" "}
					{composing.length > 1 ? "пишут" : "пишет"} ответ в этот диалог
				</p>
			)}

			<Composer
				api={api}
				conversation={conversation}
				messages={messages}
				suggestions={state.suggestions[conversation.id] ?? []}
				me={me}
				siteUrl={siteUrl}
			/>
		</section>
	);
}
