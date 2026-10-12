"use client";

import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	CreditCard,
	FileText,
	MessageCircle,
	MessagesSquare,
	Package,
	Paperclip,
	RotateCcw,
	ShoppingBag,
	Star,
	Truck,
} from "lucide-react";
import { type CSSProperties, Fragment, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	type SegmentedTabItem,
	SegmentedTabs,
} from "@/shared/components/segmented/SegmentedTabs";
import { SUPPORT_TOPICS, type SupportTopic } from "../lib/constants";
import type { SupportConversationDTO, SupportMessageDTO } from "../lib/events";
import { linkify } from "../lib/linkify";
import styles from "./history.module.css";
import { StartChatButton } from "./StartChatButton";

type Filter = "all" | "open" | "resolved";

const TOPIC_LABEL = Object.fromEntries(
	SUPPORT_TOPICS.map((t) => [t.value, t.label]),
) as Record<SupportTopic, string>;

const TOPIC_ICON: Record<SupportTopic, typeof Package> = {
	order: Package,
	product: ShoppingBag,
	documents: FileText,
	delivery: Truck,
	payment: CreditCard,
	other: MessageCircle,
};

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
	year: "numeric",
});
const dayFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
});

/** «21 сентября» в этом году, «21 сентября 2025» — в прошлых. */
function shortDate(iso: string): string {
	const date = new Date(iso);
	return date.getFullYear() === new Date().getFullYear()
		? dayFormat.format(date)
		: dateFormat.format(date).replace(/\s*г\.$/, "");
}
const timeFormat = new Intl.DateTimeFormat("ru-RU", {
	hour: "2-digit",
	minute: "2-digit",
});

interface Thread {
	status: "loading" | "ready" | "error";
	messages: SupportMessageDTO[];
	hasMore: boolean;
	loadingOlder?: boolean;
}

async function fetchPage(
	conversationId: number,
	beforeSeq: number,
): Promise<{ messages: SupportMessageDTO[]; hasMore: boolean }> {
	const response = await fetch(
		`/api/support/conversations/${conversationId}/messages?beforeSeq=${beforeSeq}`,
		{ credentials: "same-origin", cache: "no-store" },
	);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return (await response.json()) as {
		messages: SupportMessageDTO[];
		hasMore: boolean;
	};
}

/**
 * Список обращений покупателя: разлинованный, как «Мои отзывы» и заказы, с
 * той же липкой панелью отбора. Строка раскрывается в переписку на месте —
 * без перехода и без модального окна: прочитать старый ответ и вернуться к
 * списку должно стоить одного нажатия.
 *
 * Список приходит с сервера страницы (первый экран без «Загрузка…»),
 * переписка — по раскрытию, из того же API, что и окно чата. Раскрытая
 * переписка кэшируется: повторное раскрытие не ходит в сеть.
 */
export function SupportHistory({
	conversations,
	unreadIds,
	chatAvailable,
}: {
	conversations: SupportConversationDTO[];
	/** Диалоги с непрочитанным ответом менеджера (считает сервер). */
	unreadIds: number[];
	chatAvailable: boolean;
}) {
	const [unread, setUnread] = useState(() => new Set(unreadIds));
	const [filter, setFilter] = useState<Filter>("all");
	const [openId, setOpenId] = useState<number | null>(null);
	const [threads, setThreads] = useState<Record<number, Thread>>({});

	const openCount = conversations.filter((c) => c.status === "open").length;
	const items: SegmentedTabItem<Filter>[] = [
		{ key: "all", label: "Все", count: conversations.length },
		{ key: "open", label: "В работе", count: openCount },
		{
			key: "resolved",
			label: "Закрытые",
			count: conversations.length - openCount,
		},
	];
	const visible =
		filter === "all"
			? conversations
			: conversations.filter((c) => c.status === filter);

	async function load(conversation: SupportConversationDTO) {
		setThreads((all) => ({
			...all,
			[conversation.id]: { status: "loading", messages: [], hasMore: false },
		}));
		try {
			const page = await fetchPage(conversation.id, conversation.lastSeq + 1);
			setThreads((all) => ({
				...all,
				[conversation.id]: { status: "ready", ...page },
			}));
			// Прочитано — и для окна чата, и для счётчика на его кнопке.
			if (conversation.lastSeq > conversation.customerLastReadSeq) {
				void fetch(`/api/support/conversations/${conversation.id}/read`, {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ seq: conversation.lastSeq }),
				}).catch(() => {});
			}
		} catch {
			setThreads((all) => ({
				...all,
				[conversation.id]: { status: "error", messages: [], hasMore: false },
			}));
		}
	}

	async function loadOlder(conversationId: number) {
		const thread = threads[conversationId];
		const first = thread?.messages[0];
		if (!thread || !first) return;
		setThreads((all) => ({
			...all,
			[conversationId]: { ...thread, loadingOlder: true },
		}));
		try {
			const page = await fetchPage(conversationId, first.seq);
			setThreads((all) => ({
				...all,
				[conversationId]: {
					status: "ready",
					messages: [...page.messages, ...thread.messages],
					hasMore: page.hasMore,
				},
			}));
		} catch {
			setThreads((all) => ({
				...all,
				[conversationId]: { ...thread, loadingOlder: false },
			}));
		}
	}

	function toggle(conversation: SupportConversationDTO) {
		if (openId === conversation.id) {
			setOpenId(null);
			return;
		}
		setOpenId(conversation.id);
		// Прочитанное в истории — прочитано: отметка снимается сразу.
		if (unread.has(conversation.id)) {
			setUnread((ids) => {
				const next = new Set(ids);
				next.delete(conversation.id);
				return next;
			});
		}
		const cached = threads[conversation.id];
		if (!cached || cached.status === "error") void load(conversation);
	}

	if (conversations.length === 0) {
		return (
			<div className={styles.empty}>
				<span className={styles.emptyIcon} aria-hidden>
					<MessagesSquare size={22} />
				</span>
				<p className={styles.emptyTitle}>Обращений пока нет</p>
				<p className={styles.emptyText}>
					Вопрос о заказе, товаре, документах или доставке можно задать
					менеджеру в чате. Вся переписка сохранится здесь.
				</p>
				{chatAvailable && <StartChatButton label="Написать менеджеру" />}
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className={catalog.rail}>
				<div className={catalog.railRow}>
					<p className={catalog.summary} role="status">
						<span className={catalog.summaryValue}>{visible.length}</span>
						<span className={catalog.micro}>в разделе</span>
					</p>
					<span className={catalog.railDivider} aria-hidden />
					<SegmentedTabs
						items={items}
						value={filter}
						onChange={setFilter}
						label="Отбор обращений"
					/>
				</div>
			</div>

			{visible.length === 0 ? (
				<p className={styles.filterEmpty}>
					{filter === "open"
						? "Сейчас открытых обращений нет."
						: "Закрытых обращений пока нет."}
				</p>
			) : (
				<ul className={styles.rows}>
					{visible.map((conversation, index) => (
						<ConversationRow
							key={conversation.id}
							conversation={conversation}
							index={index}
							open={openId === conversation.id}
							thread={threads[conversation.id]}
							unread={unread.has(conversation.id)}
							chatAvailable={chatAvailable}
							onToggle={() => toggle(conversation)}
							onRetry={() => void load(conversation)}
							onLoadOlder={() => void loadOlder(conversation.id)}
						/>
					))}
				</ul>
			)}
		</div>
	);
}

function ConversationRow({
	conversation,
	index,
	open,
	thread,
	unread,
	chatAvailable,
	onToggle,
	onRetry,
	onLoadOlder,
}: {
	conversation: SupportConversationDTO;
	index: number;
	open: boolean;
	thread: Thread | undefined;
	unread: boolean;
	chatAvailable: boolean;
	onToggle: () => void;
	onRetry: () => void;
	onLoadOlder: () => void;
}) {
	const Icon = TOPIC_ICON[conversation.topic] ?? MessageCircle;
	const isOpen = conversation.status === "open";
	const panelId = `support-thread-${conversation.id}`;
	const lastAt = conversation.lastMessageAt ?? conversation.createdAt;

	return (
		<li
			className={`${styles.row} ${styles.enter}`}
			style={{ "--i": Math.min(index, 9) } as CSSProperties}
		>
			<button
				type="button"
				className={styles.rowButton}
				aria-expanded={open}
				aria-controls={panelId}
				onClick={onToggle}
			>
				<span className={styles.rowIcon} aria-hidden>
					<Icon size={18} />
				</span>

				<span className={styles.rowMain}>
					<span className={styles.rowTitle}>
						{TOPIC_LABEL[conversation.topic] ?? "Обращение"}
						{unread && (
							<span className={styles.unread}>
								<span className={styles.unreadDot} aria-hidden />
								Новый ответ
							</span>
						)}
					</span>
					<span className={styles.rowMeta}>
						<span>№ {conversation.id}</span>
						<span>от {shortDate(conversation.createdAt)}</span>
						{conversation.assignee && (
							<span>менеджер {conversation.assignee.name}</span>
						)}
					</span>
				</span>

				<span className={styles.rowSide}>
					<span
						className={`${styles.status} ${isOpen ? styles.statusOpen : styles.statusDone}`}
					>
						{isOpen ? (
							<span className={styles.statusDot} aria-hidden />
						) : (
							<CheckCircle2 size={13} aria-hidden />
						)}
						{isOpen ? "В работе" : "Закрыт"}
					</span>
					<time className={styles.rowDate} dateTime={lastAt}>
						{shortDate(lastAt)}
					</time>
					<ChevronDown size={18} className={styles.chevron} aria-hidden />
				</span>
			</button>

			<section
				id={panelId}
				className={styles.threadWrap}
				data-open={open}
				aria-label={`Переписка по обращению № ${conversation.id}`}
				hidden={!open && !thread}
				// Свёрнутая переписка остаётся в DOM ради анимации высоты, но
				// не должна ловить фокус и читаться скринридером.
				inert={!open}
			>
				<div className={styles.threadClip}>
					{thread && (
						<ThreadView
							conversation={conversation}
							thread={thread}
							chatAvailable={chatAvailable}
							onRetry={onRetry}
							onLoadOlder={onLoadOlder}
						/>
					)}
				</div>
			</section>
		</li>
	);
}

function ThreadView({
	conversation,
	thread,
	chatAvailable,
	onRetry,
	onLoadOlder,
}: {
	conversation: SupportConversationDTO;
	thread: Thread;
	chatAvailable: boolean;
	onRetry: () => void;
	onLoadOlder: () => void;
}) {
	if (thread.status === "loading") {
		return (
			<div className={styles.thread} aria-busy="true">
				<span className={styles.srOnly}>Загружаем переписку</span>
				<span className={`${styles.skeleton} ${styles.skeletonTheirs}`} />
				<span className={`${styles.skeleton} ${styles.skeletonMine}`} />
				<span className={`${styles.skeleton} ${styles.skeletonTheirs}`} />
			</div>
		);
	}

	if (thread.status === "error") {
		return (
			<div className={styles.thread}>
				<p className={styles.errorBox} role="alert">
					<AlertCircle size={16} aria-hidden className={styles.errorIcon} />
					<span>
						Не удалось загрузить переписку. Проверьте связь и повторите.
					</span>
					<button type="button" className={styles.linkButton} onClick={onRetry}>
						<RotateCcw size={14} aria-hidden />
						Повторить
					</button>
				</p>
			</div>
		);
	}

	const messages = thread.messages.filter((m) => m.kind !== "note");

	return (
		<div className={styles.thread}>
			{thread.hasMore && (
				<button
					type="button"
					className={styles.older}
					onClick={onLoadOlder}
					disabled={thread.loadingOlder}
				>
					{thread.loadingOlder ? "Загружаем…" : "Показать более ранние"}
				</button>
			)}

			{messages.map((message, index) => {
				const day = dayFormat.format(new Date(message.createdAt));
				const previous = messages[index - 1];
				const newDay =
					!previous || dayFormat.format(new Date(previous.createdAt)) !== day;
				return (
					<Fragment key={message.id}>
						{newDay && (
							<p className={styles.day}>
								<span>{day}</span>
							</p>
						)}
						<MessageBubble message={message} />
					</Fragment>
				);
			})}

			<div className={styles.threadFoot}>
				{conversation.status === "open" ? (
					chatAvailable && <StartChatButton label="Продолжить в чате" />
				) : (
					<p className={styles.closedNote}>
						<CheckCircle2 size={15} aria-hidden />
						<span>
							Обращение закрыто
							{conversation.resolvedAt
								? ` ${shortDate(conversation.resolvedAt)}`
								: ""}
						</span>
					</p>
				)}
				{conversation.csatScore !== null && (
					<p className={styles.csat}>
						<span className={styles.stars} aria-hidden>
							{[1, 2, 3, 4, 5].map((n) => (
								<Star
									key={n}
									size={14}
									className={
										n <= (conversation.csatScore ?? 0)
											? styles.starOn
											: styles.starOff
									}
								/>
							))}
						</span>
						Ваша оценка — {conversation.csatScore} из 5
					</p>
				)}
			</div>
		</div>
	);
}

function MessageBubble({ message }: { message: SupportMessageDTO }) {
	if (message.kind === "system") {
		return <p className={styles.system}>{message.body}</p>;
	}
	const mine = message.authorType === "customer";
	return (
		<div className={`${styles.bubble} ${mine ? styles.mine : styles.theirs}`}>
			{!mine && message.author && (
				<span className={styles.author}>{message.author.name}</span>
			)}
			{message.body && (
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
			)}
			{(message.attachments.length > 0 || message.documents.length > 0) && (
				<span className={styles.files}>
					{message.attachments.map((file) =>
						file.thumbnailUrl ? (
							<a
								key={file.id}
								href={file.url}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.thumb}
							>
								{/* biome-ignore lint/performance/noImgElement: превью вложения отдаёт свой API, next/image его не оптимизирует */}
								<img
									src={file.thumbnailUrl}
									alt={file.filename}
									loading="lazy"
								/>
							</a>
						) : (
							<a
								key={file.id}
								href={file.url}
								target="_blank"
								rel="noopener noreferrer"
								className={styles.file}
							>
								<FileText size={14} aria-hidden />
								<span>{file.filename}</span>
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
							<Paperclip size={14} aria-hidden />
							<span>{doc.title}</span>
						</a>
					))}
				</span>
			)}
			<time className={styles.time} dateTime={message.createdAt}>
				{timeFormat.format(new Date(message.createdAt))}
			</time>
		</div>
	);
}
