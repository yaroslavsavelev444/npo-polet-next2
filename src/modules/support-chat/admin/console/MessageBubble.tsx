"use client";

import type { SupportMessageDTO } from "../../lib/events";
import { linkify } from "../../lib/linkify";
import styles from "./console.module.css";
import { fileSize, fullTime, shortTime } from "./format";

const CONTEXT_LABEL = {
	order: "Заказ",
	product: "Товар",
	page: "Страница",
} as const;

export function MessageText({ text }: { text: string }) {
	return (
		<>
			{linkify(text).map((part, index) =>
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

/**
 * Одно сообщение ленты. Текст — только как текст (MessageText), картинки —
 * превью со ссылкой на оригинал, прочие файлы и документы — ссылками на
 * скачивание.
 */
export function MessageBubble({
	message,
	readByCustomer,
}: {
	message: SupportMessageDTO;
	/** Своё сообщение прочитано покупателем — галочка «прочитано». */
	readByCustomer: boolean;
}) {
	if (message.kind === "system") {
		return (
			<div className={styles.system} title={fullTime(message.createdAt)}>
				{message.body}
			</div>
		);
	}

	const outgoing = message.authorType === "staff";
	const className = [
		styles.bubble,
		outgoing ? styles.bubbleOut : styles.bubbleIn,
		message.kind === "note" ? styles.bubbleNote : "",
	].join(" ");

	return (
		<article
			className={className}
			aria-label={message.kind === "note" ? "Внутренняя заметка" : undefined}
		>
			<header className={styles.bubbleHead}>
				<span className={styles.bubbleAuthor}>
					{message.kind === "note" ? "Заметка · " : ""}
					{message.author?.name ?? (outgoing ? "Менеджер" : "Покупатель")}
				</span>
				<time dateTime={message.createdAt} title={fullTime(message.createdAt)}>
					{shortTime(message.createdAt)}
				</time>
			</header>

			{message.context && (
				<a
					className={styles.contextCard}
					href={message.context.url ?? undefined}
					target="_blank"
					rel="noopener noreferrer"
				>
					<span className={styles.contextType}>
						{CONTEXT_LABEL[message.context.type]}
					</span>
					{message.context.title ?? message.context.id}
				</a>
			)}

			{message.body && (
				<p className={styles.bubbleText}>
					<MessageText text={message.body} />
				</p>
			)}

			{message.attachments.length > 0 && (
				<ul className={styles.files}>
					{message.attachments.map((file) => (
						<li key={file.id}>
							{file.thumbnailUrl ? (
								<a
									href={file.url}
									target="_blank"
									rel="noopener noreferrer"
									className={styles.thumb}
								>
									{/* biome-ignore lint/performance/noImgElement: файл за авторизацией, next/image его не оптимизирует */}
									<img
										src={file.thumbnailUrl}
										alt={file.filename}
										loading="lazy"
									/>
								</a>
							) : (
								<a
									href={file.url}
									className={styles.file}
									download={file.filename}
								>
									📄 {file.filename} <span>{fileSize(file.filesize)}</span>
								</a>
							)}
						</li>
					))}
				</ul>
			)}

			{message.documents.length > 0 && (
				<ul className={styles.files}>
					{message.documents.map((doc) => (
						<li key={doc.id}>
							<a
								href={doc.url}
								className={styles.file}
								target="_blank"
								rel="noopener noreferrer"
							>
								📎 {doc.title} <span>{fileSize(doc.filesize)}</span>
							</a>
						</li>
					))}
				</ul>
			)}

			{outgoing && message.kind === "text" && (
				<footer className={styles.bubbleStatus}>
					{readByCustomer ? "Прочитано" : "Доставлено"}
				</footer>
			)}
		</article>
	);
}
