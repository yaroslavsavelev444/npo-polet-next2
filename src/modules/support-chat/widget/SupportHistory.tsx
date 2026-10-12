"use client";

import { useEffect, useState } from "react";
import { SUPPORT_TOPICS } from "../lib/constants";
import type { SupportConversationDTO, SupportMessageDTO } from "../lib/events";
import { linkify } from "../lib/linkify";
import { openSupportChat } from "./open-chat";
import styles from "./widget.module.css";

const TOPIC_LABEL = Object.fromEntries(
	SUPPORT_TOPICS.map((t) => [t.value, t.label]),
);
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
	year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});

/**
 * «Мои обращения» в личном кабинете: все диалоги покупателя и переписка
 * любого из них. Текущий диалог продолжается в окне чата — кнопкой.
 */
export function SupportHistory() {
	const [conversations, setConversations] = useState<
		SupportConversationDTO[] | null
	>(null);
	const [error, setError] = useState<string | null>(null);
	const [openId, setOpenId] = useState<number | null>(null);
	const [transcript, setTranscript] = useState<SupportMessageDTO[]>([]);

	useEffect(() => {
		fetch("/api/support/conversations", {
			credentials: "same-origin",
			cache: "no-store",
		})
			.then(async (response) => {
				const data = (await response.json()) as {
					conversations?: SupportConversationDTO[];
					error?: { message: string };
				};
				if (!response.ok)
					throw new Error(data.error?.message ?? "Не удалось загрузить");
				setConversations(data.conversations ?? []);
			})
			.catch((e: Error) => setError(e.message));
	}, []);

	async function show(conversation: SupportConversationDTO) {
		if (openId === conversation.id) {
			setOpenId(null);
			return;
		}
		setOpenId(conversation.id);
		setTranscript([]);
		const response = await fetch(
			`/api/support/conversations/${conversation.id}/messages?beforeSeq=${conversation.lastSeq + 1}`,
			{ credentials: "same-origin", cache: "no-store" },
		);
		if (response.ok) {
			const data = (await response.json()) as { messages: SupportMessageDTO[] };
			setTranscript(data.messages);
		}
	}

	if (error) return <p className={styles.error}>{error}</p>;
	if (!conversations) return <p className={styles.muted}>Загрузка…</p>;

	return (
		<div className={styles.history}>
			<button
				type="button"
				className={styles.primaryButton}
				onClick={() => openSupportChat()}
			>
				Написать менеджеру
			</button>
			{conversations.length === 0 ? (
				<p className={styles.muted}>Обращений пока нет.</p>
			) : (
				<ul className={styles.historyList}>
					{conversations.map((conversation) => (
						<li key={conversation.id}>
							<button
								type="button"
								className={styles.historyItem}
								aria-expanded={openId === conversation.id}
								onClick={() => void show(conversation)}
							>
								<span>
									<strong>
										{TOPIC_LABEL[conversation.topic] ?? "Обращение"}
									</strong>
									<br />
									<span className={styles.muted}>
										от {dateFormat.format(new Date(conversation.createdAt))}
										{conversation.assignee
											? ` · ${conversation.assignee.name}`
											: ""}
									</span>
								</span>
								<span className={styles.muted}>
									{conversation.status === "open" ? "открыт" : "закрыт"}
									{conversation.csatScore
										? ` · ${conversation.csatScore}/5`
										: ""}
								</span>
							</button>
							{openId === conversation.id && (
								<div className={styles.transcript}>
									{transcript.map((message) =>
										message.kind === "system" ? (
											<p key={message.id} className={styles.system}>
												{message.body}
											</p>
										) : (
											<div
												key={message.id}
												className={`${styles.message} ${message.authorType === "customer" ? styles.mine : styles.theirs}`}
											>
												{message.author && (
													<span className={styles.author}>
														{message.author.name}
													</span>
												)}
												<p className={styles.text}>
													{linkify(message.body).map((part, index) =>
														part.type === "link" ? (
															<a
																key={index}
																href={part.href}
																target="_blank"
																rel="noopener noreferrer nofollow ugc"
															>
																{part.value}
															</a>
														) : (
															<span key={index}>{part.value}</span>
														),
													)}
												</p>
												{message.attachments.map((file) => (
													<a
														key={file.id}
														href={file.url}
														className={styles.file}
														target="_blank"
														rel="noopener noreferrer"
													>
														📄 {file.filename}
													</a>
												))}
												{message.documents.map((doc) => (
													<a
														key={doc.id}
														href={doc.url}
														className={styles.file}
														target="_blank"
														rel="noopener noreferrer"
													>
														📎 {doc.title}
													</a>
												))}
												<span className={styles.meta}>
													{timeFormat.format(new Date(message.createdAt))}
												</span>
											</div>
										),
									)}
									{conversation.status === "open" && (
										<button
											type="button"
											className={styles.primaryButton}
											onClick={() => openSupportChat()}
										>
											Продолжить в чате
										</button>
									)}
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
