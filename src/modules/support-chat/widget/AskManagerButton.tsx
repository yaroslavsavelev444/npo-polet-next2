"use client";

import { MessageCircle } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import type { SupportTopic } from "../lib/constants";
import type { MessageContext } from "../lib/events";
import {
	isChatAvailable,
	openSupportChat,
	subscribeChatAvailable,
} from "./open-chat";
import styles from "./widget.module.css";

/**
 * Кнопка «Спросить менеджера» с контекстом страницы. Внешний вид — от
 * вызывающего (className): кнопка встраивается в чужие блоки и должна
 * выглядеть как их собственные действия. Появляется, только когда чат
 * доступен посетителю (open-chat.ts).
 */
export function AskManagerButton({
	context,
	topic,
	className,
	children = "Спросить менеджера",
	icon = true,
	onOpen,
}: {
	context?: MessageContext;
	topic?: SupportTopic;
	className?: string;
	children?: ReactNode;
	icon?: boolean;
	/**
	 * Вызывается перед открытием чата — чтобы закрыть слой, из которого
	 * спросили (панель поиска): иначе окно чата открывается под ним.
	 */
	onOpen?: () => void;
}) {
	// На сервере и до ответа кнопки чата — скрыто: недоступный чат не
	// должен мелькать кнопкой, которая ничего не откроет.
	const available = useSyncExternalStore(
		subscribeChatAvailable,
		isChatAvailable,
		() => false,
	);
	if (!available) return null;

	return (
		<button
			type="button"
			className={className ?? styles.askButton}
			onClick={() => {
				onOpen?.();
				openSupportChat({
					topic,
					// Ссылка по умолчанию — страница, с которой спросили: менеджер
					// откроет тот же товар, что видит покупатель.
					context: context
						? { ...context, url: context.url ?? window.location.pathname }
						: undefined,
				});
			}}
		>
			{icon && <MessageCircle size={16} aria-hidden />}
			{children}
		</button>
	);
}
