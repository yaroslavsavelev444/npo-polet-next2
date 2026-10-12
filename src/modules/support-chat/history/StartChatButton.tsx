"use client";

import { MessageCircle } from "lucide-react";
import { openSupportChat } from "../widget/open-chat";
import styles from "./history.module.css";

/**
 * Открыть окно чата. Доступность чата для покупателя решает сервер страницы:
 * кнопка рендерится, только когда писать можно, — поэтому здесь нет ожидания
 * ответа виджета, и кнопка не «проявляется» после загрузки.
 */
export function StartChatButton({
	label,
	quiet = false,
}: {
	label: string;
	quiet?: boolean;
}) {
	return (
		<button
			type="button"
			className={`${styles.btn} ${quiet ? styles.btnQuiet : styles.btnPrimary}`}
			onClick={() => openSupportChat()}
		>
			<MessageCircle size={16} aria-hidden />
			{label}
		</button>
	);
}
