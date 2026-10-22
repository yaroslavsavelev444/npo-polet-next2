"use client";

import { MessageCircle, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { WEBVISOR_HIDE } from "@/widgets/Analytics/webvisor";
import type { SupportTopic } from "../lib/constants";
import type { MessageContext } from "../lib/events";
import {
	OPEN_CHAT_EVENT,
	type OpenChatDetail,
	setChatAvailable,
} from "./open-chat";
import styles from "./widget.module.css";

/** Окно чата с socket.io-client — отдельным чанком, только по открытию. */
const ChatPanel = dynamic(() => import("./ChatPanel"), {
	ssr: false,
	loading: () => (
		<div className={styles.panel} role="status">
			<p className={styles.system}>Загрузка…</p>
		</div>
	),
});

type WidgetState =
	| { state: "guest" }
	| { state: "disabled" }
	| { state: "banned" }
	| { state: "ready"; unread: number };

const POLL_MS = 60_000;

/**
 * Пути, где кнопки чата нет: оформление заказа (не отвлекать от единственной
 * кнопки, плюс там нижний док) и вход/регистрация (покупатель ещё не вошёл).
 */
function hiddenOn(pathname: string): boolean {
	return pathname.startsWith("/checkout") || pathname.startsWith("/auth");
}

/**
 * Кнопка чата с менеджером в правом нижнем углу витрины (обратная связь —
 * в левом, см. FeedbackButton).
 *
 * Лёгкая: без сокета и без кода окна. Состояние (гость / чат выключен /
 * готов + непрочитанные) — опросом /api/support/widget раз в минуту и при
 * возврате на вкладку. Окно с сокетом подгружается только по открытию.
 *
 * Открывается кнопкой, событием `support-chat:open` (кнопки «Спросить
 * менеджера» на страницах, с контекстом) и параметром `?chat=open` (ссылка
 * из колокольчика «Менеджер ответил»).
 */
export function SupportWidget({
	socketUrl,
	consent,
}: {
	socketUrl: string | null;
	consent: { slug: string; url: string };
}) {
	const pathname = usePathname() ?? "/";
	const searchParams = useSearchParams();
	const router = useRouter();
	const [widget, setWidget] = useState<WidgetState | null>(null);
	const [open, setOpen] = useState(false);
	const [context, setContext] = useState<MessageContext | null>(null);
	const [topic, setTopic] = useState<SupportTopic | null>(null);
	const launcherRef = useRef<HTMLButtonElement>(null);
	const hidden = hiddenOn(pathname);

	/**
	 * Состояние кнопки. Периодический опрос скрытой вкладки пропускается (её
	 * никто не видит), но первая загрузка и открытие окна — никогда: иначе
	 * вкладка, открытая в фоне, навсегда осталась бы без состояния.
	 */
	const refresh = useCallback(async (force = false) => {
		if (!force && document.hidden) return;
		try {
			const response = await fetch("/api/support/widget", {
				credentials: "same-origin",
				cache: "no-store",
			});
			if (response.ok) setWidget((await response.json()) as WidgetState);
		} catch {
			// Сеть пропала — кнопка остаётся как была.
		}
	}, []);

	useEffect(() => {
		if (hidden) return;
		void refresh(true);
		if (open) return;
		const poll = () => void refresh();
		const timer = window.setInterval(poll, POLL_MS);
		document.addEventListener("visibilitychange", poll);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", poll);
		};
	}, [hidden, open, refresh]);

	const show = useCallback((detail?: OpenChatDetail) => {
		if (detail?.context) setContext(detail.context);
		if (detail?.topic) setTopic(detail.topic);
		setOpen(true);
	}, []);

	useEffect(() => {
		const listener = (event: Event) =>
			show((event as CustomEvent<OpenChatDetail>).detail);
		window.addEventListener(OPEN_CHAT_EVENT, listener);
		return () => window.removeEventListener(OPEN_CHAT_EVENT, listener);
	}, [show]);

	// ?chat=open — открыть и убрать параметр, чтобы обновление страницы не
	// открывало чат снова.
	useEffect(() => {
		if (searchParams?.get("chat") !== "open") return;
		show();
		const params = new URLSearchParams(searchParams.toString());
		params.delete("chat");
		const query = params.toString();
		router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
	}, [searchParams, pathname, router, show]);

	// Кнопки «Спросить менеджера» на странице видны, только когда чат есть.
	useEffect(() => {
		setChatAvailable(!hidden && widget !== null && widget.state !== "disabled");
	}, [hidden, widget]);

	const close = useCallback(() => {
		setOpen(false);
		void refresh(true);
		// Фокус — туда, откуда открывали.
		window.setTimeout(() => launcherRef.current?.focus(), 0);
	}, [refresh]);

	// Чат ещё не запущен (или посетитель не в пилотной группе) — кнопки нет.
	// До ответа сервера её тоже нет: мигнуть и исчезнуть хуже, чем появиться.
	if (hidden || !widget || widget.state === "disabled") return null;

	const unread = widget?.state === "ready" ? widget.unread : 0;
	const loginHref = `/auth/login?from=${encodeURIComponent(`${pathname}?chat=open`)}`;

	// Переписка конфиденциальна — Вебвизору ни окна, ни счётчика (webvisor.tsx).
	return (
		<div className={WEBVISOR_HIDE} style={{ display: "contents" }}>
			{!open && (
				<button
					ref={launcherRef}
					type="button"
					className={styles.launcher}
					onClick={() => show()}
					aria-label={
						unread > 0
							? `Чат с менеджером, непрочитанных ответов: ${unread}`
							: "Чат с менеджером"
					}
				>
					<MessageCircle size={26} aria-hidden />
					{unread > 0 && (
						<span className={styles.badge} aria-hidden>
							{unread > 9 ? "9+" : unread}
						</span>
					)}
				</button>
			)}

			{open && widget?.state === "ready" && (
				<ChatPanel
					socketUrl={socketUrl}
					consent={consent}
					context={context}
					topic={topic}
					onContextConsumed={() => setContext(null)}
					onClose={close}
				/>
			)}

			{open && widget && widget.state !== "ready" && (
				<div
					className={`${styles.panel} ${styles.panelSmall}`}
					role="dialog"
					aria-labelledby="support-chat-title"
				>
					<header className={styles.header}>
						<div className={styles.headerText}>
							<h2 id="support-chat-title">Чат с менеджером</h2>
						</div>
						<button
							type="button"
							className={styles.iconButton}
							onClick={close}
							aria-label="Закрыть"
						>
							<X size={20} aria-hidden />
						</button>
					</header>
					<div className={styles.notice}>
						{widget.state === "guest" ? (
							<>
								<p>
									Войдите в аккаунт, чтобы написать менеджеру: так он увидит
									ваши заказы и ответит здесь же.
								</p>
								<a className={styles.primaryButton} href={loginHref}>
									Войти
								</a>
							</>
						) : (
							<p>Писать в чат сейчас нельзя. Свяжитесь с нами по телефону.</p>
						)}
						<p className={styles.muted}>
							Или напишите нам через <a href="/contacts">страницу контактов</a>.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
