"use client";

import { Paperclip, Search, Send, Star, X } from "lucide-react";
import {
	Fragment,
	type KeyboardEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { RemoveScroll } from "react-remove-scroll";
import {
	MESSAGE_MAX_ATTACHMENTS,
	MESSAGE_MAX_LENGTH,
	SUPPORT_TOPICS,
	type SupportTopic,
} from "../lib/constants";
import type {
	MessageContext,
	SupportAttachmentDTO,
	SupportMessageDTO,
} from "../lib/events";
import { linkify } from "../lib/linkify";
import { useWidgetChat } from "./useWidgetChat";
import styles from "./widget.module.css";

const CONTEXT_LABEL = {
	order: "Заказ",
	product: "Товар",
	page: "Страница",
} as const;
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
	hour: "2-digit",
	minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
});

function dayOf(iso: string): string {
	const date = new Date(iso);
	const today = new Date();
	if (date.toDateString() === today.toDateString()) return "Сегодня";
	today.setDate(today.getDate() - 1);
	if (date.toDateString() === today.toDateString()) return "Вчера";
	return dayFormat.format(date);
}

function Text({ value }: { value: string }) {
	return (
		<>
			{linkify(value).map((part, index) =>
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
		</>
	);
}

function Message({
	message,
	read,
}: {
	message: SupportMessageDTO;
	read: boolean;
}) {
	if (message.kind === "system") {
		return <p className={styles.system}>{message.body}</p>;
	}
	const mine = message.authorType === "customer";
	return (
		<div className={`${styles.message} ${mine ? styles.mine : styles.theirs}`}>
			{!mine && message.author && (
				<span className={styles.author}>{message.author.name}</span>
			)}
			{message.context && (
				<span className={styles.contextCard}>
					{CONTEXT_LABEL[message.context.type]}:{" "}
					{message.context.title ?? message.context.id}
				</span>
			)}
			{message.body && (
				<p className={styles.text}>
					<Text value={message.body} />
				</p>
			)}
			{message.attachments.map((file) =>
				file.thumbnailUrl ? (
					<a
						key={file.id}
						href={file.url}
						target="_blank"
						rel="noopener noreferrer"
						className={styles.thumb}
					>
						{/* biome-ignore lint/performance/noImgElement: файл за авторизацией, next/image его не оптимизирует */}
						<img src={file.thumbnailUrl} alt={file.filename} loading="lazy" />
					</a>
				) : (
					<a
						key={file.id}
						href={file.url}
						download={file.filename}
						className={styles.file}
					>
						📄 {file.filename}
					</a>
				),
			)}
			{message.documents.map((doc) => (
				<a
					key={doc.id}
					href={doc.url}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.file}
				>
					📎 {doc.title}
				</a>
			))}
			<span className={styles.meta}>
				{timeFormat.format(new Date(message.createdAt))}
				{mine && (read ? " · прочитано" : "")}
			</span>
		</div>
	);
}

interface KnowledgeHint {
	type: "knowledge" | "faq";
	title: string;
	href: string;
}

/**
 * Окно чата для вошедшего покупателя. Грузится лениво (next/dynamic в
 * SupportWidget) вместе с socket.io-client — на страницы, где чат не
 * открывали, этот код не попадает.
 *
 * На телефоне — полноэкранный лист с блокировкой прокрутки страницы, на
 * широком экране — окно в углу, страница под ним остаётся живой.
 */
export function ChatPanel({
	socketUrl,
	consent,
	context,
	topic: requestedTopic,
	onContextConsumed,
	onClose,
}: {
	socketUrl: string | null;
	consent: { slug: string; url: string };
	context: MessageContext | null;
	topic: SupportTopic | null;
	onContextConsumed: () => void;
	onClose: () => void;
}) {
	const chat = useWidgetChat({ socketUrl, enabled: true });
	const [draft, setDraft] = useState("");
	const [attachments, setAttachments] = useState<SupportAttachmentDTO[]>([]);
	const [uploading, setUploading] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [topic, setTopic] = useState<SupportTopic>(requestedTopic ?? "other");
	const [consentGiven, setConsentGiven] = useState(false);
	const [hints, setHints] = useState<KnowledgeHint[] | null>(null);
	const [csatScore, setCsatScore] = useState(0);
	const [csatComment, setCsatComment] = useState("");
	const [isPhone, setIsPhone] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const feedRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastTyping = useRef(0);

	const firstMessage = chat.loaded && chat.conversation === null;
	const resolved = chat.conversation?.status === "resolved";
	const awaitingCsat = resolved && chat.conversation?.csatScore === null;

	useEffect(() => {
		if (requestedTopic) setTopic(requestedTopic);
	}, [requestedTopic]);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 640px)");
		const update = () => setIsPhone(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	// Прочитано — когда окно открыто и вкладка на виду: при открытии, при
	// возврате на вкладку и при каждом новом сообщении, пришедшем в открытое окно.
	// biome-ignore lint/correctness/useExhaustiveDependencies: новое сообщение в ленте — повод отметить прочтение
	useEffect(() => {
		const mark = () => !document.hidden && chat.markRead();
		mark();
		document.addEventListener("visibilitychange", mark);
		return () => document.removeEventListener("visibilitychange", mark);
	}, [chat.markRead, chat.messages.length]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: прокрутка — по появлению нового в ленте
	useLayoutEffect(() => {
		const feed = feedRef.current;
		if (feed) feed.scrollTop = feed.scrollHeight;
	}, [chat.messages.length, chat.pending.length, chat.staffTyping]);

	function onKeyDownPanel(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === "Escape") {
			event.stopPropagation();
			onClose();
			return;
		}
		// Фокус не уходит из окна, пока оно открыто.
		if (event.key !== "Tab" || !panelRef.current) return;
		const focusable = panelRef.current.querySelectorAll<HTMLElement>(
			'button:not([disabled]), a[href], textarea, input:not([type="hidden"]), [tabindex]:not([tabindex="-1"])',
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function upload(files: FileList | File[]) {
		for (const file of [...files].slice(
			0,
			MESSAGE_MAX_ATTACHMENTS - attachments.length,
		)) {
			setUploading((n) => n + 1);
			try {
				const body = new FormData();
				body.append("file", file);
				const response = await fetch("/api/support/attachments", {
					method: "POST",
					body,
					credentials: "same-origin",
				});
				const data = (await response.json()) as {
					attachment?: SupportAttachmentDTO;
					error?: { message: string };
				};
				if (!response.ok || !data.attachment) {
					throw new Error(data.error?.message ?? "Не удалось загрузить файл");
				}
				setAttachments((list) => [
					...list,
					data.attachment as SupportAttachmentDTO,
				]);
			} catch (uploadError) {
				setError(
					uploadError instanceof Error
						? uploadError.message
						: "Не удалось загрузить файл",
				);
			} finally {
				setUploading((n) => n - 1);
			}
		}
	}

	function send() {
		const body = draft.trim();
		if (!body && attachments.length === 0) return;
		if (uploading > 0) return;
		if (firstMessage && !consentGiven) {
			setError("Отметьте согласие на обработку персональных данных");
			return;
		}
		chat.send({
			body,
			attachments,
			context,
			...(firstMessage ? { topic, consentDocument: consent.slug } : {}),
		});
		setDraft("");
		setAttachments([]);
		setHints(null);
		setError(null);
		onContextConsumed();
		chat.typing(false);
	}

	function onKeyDownText(event: KeyboardEvent<HTMLTextAreaElement>) {
		// На телефоне Enter — перенос строки: отправка — кнопкой, как в мессенджерах.
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!isPhone &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			send();
		}
	}

	async function findHints() {
		const query = draft.trim();
		if (query.length < 3) return;
		try {
			const response = await fetch(
				`/api/support/knowledge?q=${encodeURIComponent(query)}`,
				{
					credentials: "same-origin",
				},
			);
			const data = (await response.json()) as { hints?: KnowledgeHint[] };
			setHints(data.hints ?? []);
		} catch {
			setHints([]);
		}
	}

	const assignee = chat.conversation?.assignee;
	const messages = chat.messages;

	const panel = (
		<div
			ref={panelRef}
			className={styles.panel}
			role="dialog"
			aria-modal={isPhone}
			aria-labelledby="support-chat-title"
			onKeyDown={onKeyDownPanel}
		>
			<header className={styles.header}>
				{assignee?.avatarUrl ? (
					// biome-ignore lint/performance/noImgElement: маленький аватар из медиатеки
					<img className={styles.avatar} src={assignee.avatarUrl} alt="" />
				) : (
					<span className={styles.avatarFallback} aria-hidden>
						{(assignee?.name ?? "Н").slice(0, 1)}
					</span>
				)}
				<div className={styles.headerText}>
					<h2 id="support-chat-title">
						{assignee ? `${assignee.name}, менеджер` : "Чат с менеджером"}
					</h2>
					{chat.eta && <p>{chat.eta.label}</p>}
				</div>
				<button
					type="button"
					className={styles.iconButton}
					onClick={onClose}
					aria-label="Закрыть чат"
				>
					<X size={20} aria-hidden />
				</button>
			</header>

			{chat.connection === "offline" && (
				<p className={styles.banner} role="status">
					Нет связи — переподключаемся. Сообщения уйдут, как только она
					появится.
				</p>
			)}

			<div className={styles.feed} ref={feedRef} aria-live="polite">
				{!chat.loaded && <p className={styles.system}>Загрузка…</p>}
				{chat.hasMore && (
					<button
						type="button"
						className={styles.older}
						onClick={() => void chat.loadOlder()}
					>
						Показать раньше
					</button>
				)}
				{firstMessage && (
					<p className={styles.greeting}>
						{chat.greeting || "Напишите вопрос — менеджер ответит здесь же."}
					</p>
				)}
				{messages.map((message, index) => {
					const newDay =
						!messages[index - 1] ||
						dayOf(messages[index - 1].createdAt) !== dayOf(message.createdAt);
					return (
						<Fragment key={message.id}>
							{newDay && (
								<p className={styles.day}>{dayOf(message.createdAt)}</p>
							)}
							<Message
								message={message}
								read={(chat.conversation?.staffLastReadSeq ?? 0) >= message.seq}
							/>
						</Fragment>
					);
				})}
				{chat.pending.map((item) => (
					<div
						key={item.clientMessageId}
						className={`${styles.message} ${styles.mine} ${styles.pending}`}
					>
						{item.body && <p className={styles.text}>{item.body}</p>}
						{item.attachments.map((file) => (
							<span key={file.id} className={styles.file}>
								📄 {file.filename}
							</span>
						))}
						<span className={styles.meta}>
							{item.status === "failed" ? (
								<>
									{item.error}{" "}
									<button
										type="button"
										className={styles.linkButton}
										onClick={() => void chat.retry(item.clientMessageId)}
									>
										Повторить
									</button>{" "}
									<button
										type="button"
										className={styles.linkButton}
										onClick={() => chat.discard(item.clientMessageId)}
									>
										Удалить
									</button>
								</>
							) : (
								"отправляется…"
							)}
						</span>
					</div>
				))}
				{chat.staffTyping && (
					<p className={styles.typing}>{chat.staffTyping.name} печатает…</p>
				)}

				{awaitingCsat && (
					<form
						className={styles.csat}
						onSubmit={(event) => {
							event.preventDefault();
							if (csatScore > 0) {
								void chat
									.submitCsat(csatScore, csatComment)
									.catch((e: Error) => setError(e.message));
							}
						}}
					>
						<p>Оцените, пожалуйста, помощь менеджера</p>
						<div className={styles.stars} role="radiogroup" aria-label="Оценка">
							{[1, 2, 3, 4, 5].map((score) => (
								<button
									key={score}
									type="button"
									role="radio"
									aria-checked={csatScore === score}
									aria-label={`${score} из 5`}
									className={score <= csatScore ? styles.starOn : styles.star}
									onClick={() => setCsatScore(score)}
								>
									<Star size={22} aria-hidden />
								</button>
							))}
						</div>
						{csatScore > 0 && (
							<>
								<textarea
									className={styles.csatComment}
									value={csatComment}
									onChange={(event) => setCsatComment(event.target.value)}
									maxLength={1000}
									rows={2}
									placeholder="Комментарий (необязательно)"
									aria-label="Комментарий к оценке"
								/>
								<button type="submit" className={styles.primaryButton}>
									Отправить оценку
								</button>
							</>
						)}
					</form>
				)}
				{resolved && chat.conversation?.csatScore != null && (
					<p className={styles.system}>
						Спасибо за оценку! Если появятся вопросы — просто напишите.
					</p>
				)}
			</div>

			<footer className={styles.composer}>
				{firstMessage && (
					<>
						<div
							className={styles.topics}
							role="group"
							aria-label="Тема вопроса"
						>
							{SUPPORT_TOPICS.map((t) => (
								<button
									key={t.value}
									type="button"
									aria-pressed={topic === t.value}
									className={topic === t.value ? styles.topicOn : styles.topic}
									onClick={() => setTopic(t.value)}
								>
									{t.label}
								</button>
							))}
						</div>
						<label className={styles.consent}>
							<input
								type="checkbox"
								checked={consentGiven}
								onChange={(event) => setConsentGiven(event.target.checked)}
							/>
							<span>
								Согласен на{" "}
								<a href={consent.url} target="_blank" rel="noopener noreferrer">
									обработку персональных данных
								</a>
							</span>
						</label>
					</>
				)}

				{context && (
					<span className={styles.chip}>
						{CONTEXT_LABEL[context.type]}: {context.title ?? context.id}
						<button
							type="button"
							aria-label="Не прикреплять"
							onClick={onContextConsumed}
						>
							×
						</button>
					</span>
				)}
				{(attachments.length > 0 || uploading > 0) && (
					<div className={styles.chips}>
						{attachments.map((file) => (
							<span key={file.id} className={styles.chip}>
								📄 {file.filename}
								<button
									type="button"
									aria-label={`Убрать ${file.filename}`}
									onClick={() =>
										setAttachments((list) =>
											list.filter((a) => a.id !== file.id),
										)
									}
								>
									×
								</button>
							</span>
						))}
						{uploading > 0 && <span className={styles.chip}>Загрузка…</span>}
					</div>
				)}
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
				{hints && (
					<ul className={styles.hints}>
						{hints.length === 0 && (
							<li>Ничего не нашлось — спросите менеджера.</li>
						)}
						{hints.map((hint) => (
							<li key={hint.href}>
								<a href={hint.href} target="_blank" rel="noopener noreferrer">
									{hint.type === "faq" ? "Вопрос-ответ: " : ""}
									{hint.title}
								</a>
							</li>
						))}
					</ul>
				)}

				<div className={styles.inputRow}>
					<label className={styles.iconButton} title="Прикрепить файл">
						<Paperclip size={20} aria-hidden />
						<span className={styles.srOnly}>Прикрепить файл</span>
						<input
							type="file"
							multiple
							hidden
							accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx"
							onChange={(event) => {
								if (event.target.files) void upload(event.target.files);
								event.target.value = "";
							}}
						/>
					</label>
					<textarea
						ref={textareaRef}
						className={styles.textarea}
						value={draft}
						maxLength={MESSAGE_MAX_LENGTH}
						rows={1}
						placeholder={
							resolved ? "Напишите, если остались вопросы" : "Ваш вопрос"
						}
						aria-label="Сообщение менеджеру"
						onChange={(event) => {
							setDraft(event.target.value);
							const now = Date.now();
							if (now - lastTyping.current > 3_000) {
								lastTyping.current = now;
								chat.typing(true);
							}
						}}
						onBlur={() => chat.typing(false)}
						onKeyDown={onKeyDownText}
						onPaste={(event) => {
							if (event.clipboardData.files.length > 0) {
								event.preventDefault();
								void upload(event.clipboardData.files);
							}
						}}
					/>
					<button
						type="button"
						className={styles.sendButton}
						onClick={send}
						disabled={
							uploading > 0 || (!draft.trim() && attachments.length === 0)
						}
						aria-label="Отправить"
					>
						<Send size={18} aria-hidden />
					</button>
				</div>
				{draft.trim().length >= 3 && !hints && (
					<button
						type="button"
						className={styles.linkButton}
						onClick={() => void findHints()}
					>
						<Search size={14} aria-hidden /> Поискать ответ в базе знаний
					</button>
				)}
			</footer>
		</div>
	);

	return isPhone ? <RemoveScroll>{panel}</RemoveScroll> : panel;
}

export default ChatPanel;
