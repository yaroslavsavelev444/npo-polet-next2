"use client";

import { ChevronDown } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import styles from "./Catalog.module.css";

interface CatalogPopoverProps {
	/** Содержимое кнопки: иконка, подпись, значение. */
	trigger: ReactNode;
	/** Функция получает закрытие панели — для списков, выбор в которых её
	 *  завершает (сортировка). Фильтры остаются открытыми: их подкручивают. */
	children: ReactNode | ((close: () => void) => ReactNode);
	/** К какому краю кнопки прижимается панель. */
	align?: "start" | "end";
	/** Фильтр применён — кнопка красится акцентом. */
	active?: boolean;
	label: string;
	className?: string;
	panelClassName?: string;
}

/**
 * Всплывающая панель органа управления каталогом (цена, сортировка).
 *
 * Панель ОСТАЁТСЯ в разметке закрытой — иначе оборвалась бы анимация ухода, а
 * она здесь несёт смысл: панель «сворачивается обратно в кнопку». Но
 * присутствие в DOM и доступность — разные вещи, поэтому закрытая панель
 * помечена inert: её нет ни в обходе табом, ни в дереве доступности, ни под
 * курсором. Тот же приём, что в UI/Drawer.
 *
 * Закрытие по нажатию вне панели ловится на pointerdown, а не на click: между
 * ними успевает пройти прокрутка и повторное нажатие, и панель закрывалась с
 * задержкой в один кадр.
 */
export function CatalogPopover({
	trigger,
	children,
	align = "start",
	active = false,
	label,
	className,
	panelClassName,
}: CatalogPopoverProps) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();

	const close = useCallback(() => setOpen(false), []);

	useEffect(() => {
		if (!open) return;

		const handlePointer = (event: PointerEvent) => {
			if (!wrapRef.current?.contains(event.target as Node)) close();
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			close();
			// Фокус возвращается на кнопку: клавиатурный пользователь остаётся
			// там, откуда открыл панель, а не улетает в начало документа.
			triggerRef.current?.focus({ preventScroll: true });
		};

		document.addEventListener("pointerdown", handlePointer);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("pointerdown", handlePointer);
			document.removeEventListener("keydown", handleKey);
		};
	}, [open, close]);

	// Липкая панель управления уезжает вместе со страницей, а поповер к ней
	// приклеен — при прокрутке он закрывается, иначе висел бы над сеткой
	// оторванным прямоугольником.
	useEffect(() => {
		if (!open) return;
		const handleScroll = () => close();
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [open, close]);

	return (
		<div ref={wrapRef} className={`${styles.popoverWrap} ${className ?? ""}`}>
			<button
				ref={triggerRef}
				type="button"
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-controls={panelId}
				aria-label={label}
				data-open={open || undefined}
				data-active={active || undefined}
				onClick={() => setOpen((value) => !value)}
				className={styles.control}
			>
				{trigger}
				<ChevronDown size={14} aria-hidden className={styles.controlChevron} />
			</button>

			<div
				id={panelId}
				role="dialog"
				aria-label={label}
				inert={!open}
				data-open={open || undefined}
				data-align={align}
				className={`${styles.popover} ${panelClassName ?? ""}`}
			>
				{typeof children === "function" ? children(close) : children}
			</div>
		</div>
	);
}

export default CatalogPopover;
