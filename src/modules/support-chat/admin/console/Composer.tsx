"use client";

import {
	type ClipboardEvent,
	type DragEvent,
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { renderCannedBody } from "../../lib/canned-render";
import {
	MESSAGE_MAX_ATTACHMENTS,
	MESSAGE_MAX_LENGTH,
} from "../../lib/constants";
import {
	type CannedSuggestionDTO,
	CLIENT_EVENTS,
	type StaffConversationDTO,
	type SupportAttachmentDTO,
	type SupportMessageDTO,
} from "../../lib/events";
import styles from "./console.module.css";
import { fileSize } from "./format";
import type { ConsoleApi } from "./useConsole";

const DRAFT_PREFIX = "support-draft:";
const COMPOSING_THROTTLE_MS = 3_000;

interface KnowledgeHint {
	type: "knowledge" | "faq";
	title: string;
	href: string;
	snippet: string | null;
}

function readDraft(conversationId: number): string {
	try {
		return window.localStorage.getItem(DRAFT_PREFIX + conversationId) ?? "";
	} catch {
		return "";
	}
}

function writeDraft(conversationId: number, text: string): void {
	try {
		if (text) window.localStorage.setItem(DRAFT_PREFIX + conversationId, text);
		else window.localStorage.removeItem(DRAFT_PREFIX + conversationId);
	} catch {
		// Черновик — удобство: без хранилища просто не переживёт перезагрузку.
	}
}

/**
 * Поле ответа менеджера.
 *
 *  • Enter — отправить, Shift+Enter — перенос строки.
 *  • «Заметка» — сообщение видят только менеджеры.
 *  • «/» в начале — заготовки по ярлыку или названию; переменные
 *    подставляются при вставке, документы заготовки прикрепляются.
 *  • Подсказки к последнему сообщению покупателя — над полем, в один клик.
 *  • Черновик на каждый диалог хранится в браузере до отправки.
 *
 * Заготовка никогда не отправляется сама: она попадает в поле, и менеджер
 * может её поправить.
 */
export function Composer({
	api,
	conversation,
	messages,
	suggestions,
	me,
	siteUrl,
}: {
	api: ConsoleApi;
	conversation: StaffConversationDTO;
	messages: SupportMessageDTO[];
	suggestions: CannedSuggestionDTO[];
	me: { adminId: number; name: string };
	siteUrl: string;
}) {
	const conversationId = conversation.id;
	const [text, setText] = useState(() => readDraft(conversationId));
	const [kind, setKind] = useState<"text" | "note">("text");
	const [attachments, setAttachments] = useState<SupportAttachmentDTO[]>([]);
	const [documents, setDocuments] = useState<{ id: number; title: string }[]>(
		[],
	);
	const [cannedResponseId, setCannedResponseId] = useState<number | null>(null);
	const [uploading, setUploading] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [missing, setMissing] = useState<string[]>([]);
	const [canned, setCanned] = useState<CannedSuggestionDTO[]>([]);
	const [slashIndex, setSlashIndex] = useState(0);
	const [kbOpen, setKbOpen] = useState(false);
	const [kbQuery, setKbQuery] = useState("");
	const [kbHints, setKbHints] = useState<KnowledgeHint[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const lastComposingAt = useRef(0);

	const resolved = conversation.status !== "open";
	const effectiveKind = resolved ? "note" : kind;

	// Смена диалога — свой черновик и чистое состояние.
	useEffect(() => {
		setText(readDraft(conversationId));
		setAttachments([]);
		setDocuments([]);
		setCannedResponseId(null);
		setError(null);
		setMissing([]);
		setKbOpen(false);
	}, [conversationId]);

	useEffect(() => {
		void api
			.request<CannedSuggestionDTO[]>(CLIENT_EVENTS.staffCanned)
			.then(setCanned)
			.catch(() => {});
	}, [api]);

	useEffect(() => writeDraft(conversationId, text), [conversationId, text]);

	const slashQuery = /^\/(\S*)$/.exec(text)?.[1]?.toLowerCase() ?? null;
	const slashMatches = useMemo(() => {
		if (slashQuery === null) return [];
		return canned
			.filter(
				(c) =>
					c.shortcut?.toLowerCase().startsWith(slashQuery) ||
					c.title.toLowerCase().includes(slashQuery),
			)
			.slice(0, 8);
	}, [canned, slashQuery]);

	const orderNumber = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const context = messages[i].context;
			if (context?.type === "order")
				return String(context.title ?? context.id ?? "");
		}
		return null;
	}, [messages]);

	function signalComposing(active: boolean) {
		const now = Date.now();
		if (active && now - lastComposingAt.current < COMPOSING_THROTTLE_MS) return;
		lastComposingAt.current = active ? now : 0;
		api.emit(CLIENT_EVENTS.staffComposing, { conversationId, active });
		if (effectiveKind === "text")
			api.emit(CLIENT_EVENTS.typing, { conversationId, active });
	}

	function insertCanned(item: CannedSuggestionDTO) {
		const { text: rendered, missing: absent } = renderCannedBody(item.body, {
			имя: conversation.customer?.name?.split(" ")[0] ?? null,
			менеджер: me.name,
			номерЗаказа: orderNumber,
		});
		setText(rendered);
		setMissing(absent);
		setCannedResponseId(item.id);
		setDocuments(item.documents);
		textareaRef.current?.focus();
	}

	async function upload(files: FileList | File[]) {
		const list = [...files].slice(
			0,
			MESSAGE_MAX_ATTACHMENTS - attachments.length,
		);
		for (const file of list) {
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
				if (!response.ok || !data.attachment)
					throw new Error(data.error?.message ?? "Не удалось загрузить");
				setAttachments((current) => [
					...current,
					data.attachment as SupportAttachmentDTO,
				]);
			} catch (uploadError) {
				setError(
					uploadError instanceof Error
						? uploadError.message
						: "Не удалось загрузить",
				);
			} finally {
				setUploading((n) => n - 1);
			}
		}
	}

	async function send() {
		const body = text.trim();
		if (!body && attachments.length === 0 && documents.length === 0) return;
		if (uploading > 0) return;
		const clientMessageId = crypto.randomUUID();
		const payload = {
			conversationId,
			clientMessageId,
			body,
			kind: effectiveKind,
			attachmentIds: attachments.map((a) => a.id),
			documentIds: documents.map((d) => d.id),
			...(cannedResponseId ? { cannedResponseId } : {}),
		};
		api.dispatch({
			type: "pending",
			message: {
				clientMessageId,
				conversationId,
				body,
				kind: effectiveKind,
				error: null,
			},
		});
		setText("");
		setAttachments([]);
		setDocuments([]);
		setCannedResponseId(null);
		setMissing([]);
		setError(null);
		signalComposing(false);
		try {
			await api.request(CLIENT_EVENTS.staffMessageSend, payload);
		} catch (sendError) {
			const message =
				sendError instanceof Error ? sendError.message : "Не отправлено";
			api.dispatch({ type: "pendingFailed", clientMessageId, error: message });
			// Вернуть текст в поле, чтобы не набирать заново.
			setText(body);
			setError(message);
		}
	}

	function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (slashMatches.length > 0) {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				const step = event.key === "ArrowDown" ? 1 : -1;
				setSlashIndex(
					(i) => (i + step + slashMatches.length) % slashMatches.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				insertCanned(
					slashMatches[Math.min(slashIndex, slashMatches.length - 1)],
				);
				return;
			}
			if (event.key === "Escape") {
				setText("");
				return;
			}
		}
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			void send();
		}
	}

	function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		if (event.clipboardData.files.length > 0) {
			event.preventDefault();
			void upload(event.clipboardData.files);
		}
	}

	function onDrop(event: DragEvent<HTMLDivElement>) {
		if (event.dataTransfer.files.length > 0) {
			event.preventDefault();
			void upload(event.dataTransfer.files);
		}
	}

	async function searchKnowledge() {
		const query = kbQuery.trim();
		if (query.length < 2) return;
		try {
			const response = await fetch(
				`/api/support/knowledge?q=${encodeURIComponent(query)}`,
				{
					credentials: "same-origin",
				},
			);
			const data = (await response.json()) as { hints?: KnowledgeHint[] };
			setKbHints(data.hints ?? []);
		} catch {
			setKbHints([]);
		}
	}

	function insertLink(hint: KnowledgeHint) {
		const url = new URL(hint.href, siteUrl || window.location.origin).href;
		setText(
			(current) =>
				`${current}${current && !current.endsWith("\n") ? "\n" : ""}${hint.title}: ${url}`,
		);
		setKbOpen(false);
		textareaRef.current?.focus();
	}

	return (
		<div
			className={`${styles.composer} ${effectiveKind === "note" ? styles.composerNote : ""}`}
			onDragOver={(event) => event.preventDefault()}
			onDrop={onDrop}
		>
			{suggestions.length > 0 && !text && (
				<div
					className={styles.suggestions}
					role="group"
					aria-label="Подходящие заготовки"
				>
					{suggestions.map((item) => (
						<button
							key={item.id}
							type="button"
							className={styles.chip}
							onClick={() => insertCanned(item)}
						>
							💡 {item.title}
						</button>
					))}
				</div>
			)}

			{slashMatches.length > 0 && (
				<ul className={styles.slash} role="listbox" aria-label="Заготовки">
					{slashMatches.map((item, index) => (
						<li
							key={item.id}
							role="option"
							aria-selected={index === slashIndex}
						>
							<button
								type="button"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => insertCanned(item)}
							>
								<strong>
									{item.shortcut ? `/${item.shortcut}` : item.title}
								</strong>
								<span>
									{item.shortcut ? item.title : item.body.slice(0, 80)}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}

			{(attachments.length > 0 || documents.length > 0 || uploading > 0) && (
				<div className={styles.chips}>
					{attachments.map((file) => (
						<span key={file.id} className={styles.chip}>
							📄 {file.filename} {fileSize(file.filesize)}
							<button
								type="button"
								aria-label={`Убрать ${file.filename}`}
								onClick={() =>
									setAttachments((list) => list.filter((a) => a.id !== file.id))
								}
							>
								×
							</button>
						</span>
					))}
					{documents.map((doc) => (
						<span key={doc.id} className={styles.chip}>
							📎 {doc.title}
							<button
								type="button"
								aria-label={`Убрать ${doc.title}`}
								onClick={() =>
									setDocuments((list) => list.filter((d) => d.id !== doc.id))
								}
							>
								×
							</button>
						</span>
					))}
					{uploading > 0 && <span className={styles.chip}>Загрузка…</span>}
				</div>
			)}

			{missing.length > 0 && (
				<p className={styles.warning}>
					Не хватило данных для: {missing.map((m) => `{{${m}}}`).join(", ")} —
					допишите вручную.
				</p>
			)}
			{error && <p className={styles.error}>{error}</p>}
			{resolved && (
				<p className={styles.warning}>
					Диалог закрыт — можно оставить заметку. Чтобы ответить покупателю,
					переоткройте его.
				</p>
			)}

			<textarea
				ref={textareaRef}
				className={styles.textarea}
				value={text}
				maxLength={MESSAGE_MAX_LENGTH}
				rows={3}
				placeholder={
					effectiveKind === "note"
						? "Заметка для коллег — покупатель её не увидит"
						: "Ответ покупателю. «/» — заготовки, Shift+Enter — новая строка"
				}
				onChange={(event) => {
					setText(event.target.value);
					setSlashIndex(0);
					if (cannedResponseId && !event.target.value)
						setCannedResponseId(null);
					signalComposing(event.target.value.length > 0);
				}}
				onKeyDown={onKeyDown}
				onPaste={onPaste}
				onBlur={() => signalComposing(false)}
				aria-label={effectiveKind === "note" ? "Текст заметки" : "Текст ответа"}
			/>

			<div className={styles.composerBar}>
				<div className={styles.composerTools}>
					<label className={styles.toolButton}>
						Файл
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
					<label className={styles.toolButton}>
						<input
							type="checkbox"
							checked={effectiveKind === "note"}
							disabled={resolved}
							onChange={(event) =>
								setKind(event.target.checked ? "note" : "text")
							}
						/>
						Заметка
					</label>
					<button
						type="button"
						className={styles.toolButton}
						onClick={() => setKbOpen((open) => !open)}
						aria-expanded={kbOpen}
					>
						База знаний
					</button>
				</div>
				<button
					type="button"
					className={styles.sendButton}
					onClick={() => void send()}
					disabled={
						uploading > 0 ||
						(!text.trim() && attachments.length === 0 && documents.length === 0)
					}
				>
					{effectiveKind === "note" ? "Сохранить заметку" : "Отправить"}
				</button>
			</div>

			{kbOpen && (
				<div className={styles.kb}>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void searchKnowledge();
						}}
					>
						<input
							className={styles.search}
							type="search"
							value={kbQuery}
							onChange={(event) => setKbQuery(event.target.value)}
							placeholder="Найти статью или вопрос FAQ"
							aria-label="Поиск по базе знаний"
						/>
					</form>
					<ul>
						{kbHints.map((hint) => (
							<li key={hint.href}>
								<button
									type="button"
									className={styles.linkButton}
									onClick={() => insertLink(hint)}
								>
									{hint.type === "faq" ? "FAQ · " : ""}
									{hint.title}
								</button>
								{hint.snippet && (
									<span className={styles.muted}>{hint.snippet}</span>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
