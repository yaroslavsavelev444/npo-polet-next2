"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Catalog.module.css";

interface CatalogSheetProps {
	open: boolean;
	onClose: () => void;
	title: string;
	/** Приписка к заголовку — число позиций, текущее значение. */
	titleNote?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}

/**
 * Нижний лист каталога — единственная поверхность фильтрации и сортировки на
 * узком экране.
 *
 * Почему не общий UI/Drawer: у листа материал уже обновлённых поверхностей
 * (панель корзины, мобильное меню) — тёмный --void, разлиновка --rule,
 * моноширинный заголовок, учёт безопасных зон. Drawer построен на --surface с
 * собственной шапкой и своим ритмом отступов; вписать его сюда можно было бы
 * только цепочкой !important-переопределений, что хуже полусотни строк
 * раскладки. Механика доступности при этом повторена один в один:
 *
 *   • лист остаётся в разметке закрытым (иначе оборвётся анимация ухода), но
 *     помечается inert — его нет ни в обходе табом, ни для скринридера;
 *   • aria-modal выставляется только на время показа;
 *   • фокус возвращается на кнопку, которой лист открыли;
 *   • прокрутка страницы блокируется, прокрутка внутри — с overscroll
 *     containment, чтобы докрутка до конца не утаскивала страницу.
 */
export function CatalogSheet({
	open,
	onClose,
	title,
	titleNote,
	children,
	footer,
}: CatalogSheetProps) {
	const titleId = useId();
	const [mounted, setMounted] = useState(false);
	const restoreFocusRef = useRef<HTMLElement | null>(null);

	// Портал недоступен при SSR, а проверка `typeof window` прямо в рендере
	// давала бы расхождение гидратации: сервер отдаёт null, а первый
	// клиентский проход — уже портал.
	useEffect(() => setMounted(true), []);

	useEffect(() => {
		if (!open) return;
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open, onClose]);

	useEffect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open]);

	useEffect(() => {
		if (open) {
			restoreFocusRef.current = document.activeElement as HTMLElement | null;
			return;
		}
		const restore = restoreFocusRef.current;
		restoreFocusRef.current = null;
		if (restore?.isConnected) restore.focus({ preventScroll: true });
	}, [open]);

	if (!mounted) return null;

	return createPortal(
		<div data-open={open || undefined} className={styles.sheetRoot}>
			{/* Затемнение закрывает лист нажатием указателем. Клавиатурный путь
			    закрытия — Escape и кнопка в шапке, поэтому сам слой скрыт от
			    вспомогательных технологий и в обход табом не входит. */}
			<div aria-hidden onClick={onClose} className={styles.sheetOverlay} />

			<div
				role="dialog"
				aria-modal={open || undefined}
				aria-labelledby={titleId}
				inert={!open}
				className={styles.sheetPanel}
			>
				<span aria-hidden className={styles.sheetGrabber} />

				<div className={styles.sheetHeader}>
					<h2 id={titleId} className={styles.sheetTitle}>
						{title}
						{titleNote}
					</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="Закрыть"
						className={styles.sheetClose}
					>
						<X size={16} aria-hidden />
					</button>
				</div>

				<div className={styles.sheetBody}>{children}</div>

				{footer && <div className={styles.sheetFooter}>{footer}</div>}
			</div>
		</div>,
		document.body,
	);
}

export default CatalogSheet;
