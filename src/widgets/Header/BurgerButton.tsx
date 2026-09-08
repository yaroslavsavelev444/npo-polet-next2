"use client";

import { forwardRef } from "react";
import { cn } from "@/utils/cn";
import styles from "./BurgerButton.module.css";

interface Props {
	isOpen: boolean;
	onClick: () => void;
	/** id панели меню — для aria-controls. */
	controls: string;
	className?: string;
}

/**
 * Кнопка открытия мобильного меню.
 *
 * Раньше здесь просто менялись две иконки lucide (Menu ↔ X): смена была
 * мгновенной и никак не связывала кнопку с открывающейся панелью. Теперь это
 * один элемент, который на глазах складывается в крест за то же время, что
 * панель успевает выехать, — жест кнопки и жест меню читаются как одно
 * движение.
 *
 * Оболочка (размеры, рамка, фон, `lg:hidden`) намеренно повторяет прежние
 * классы: сама шапка не меняется, меняется только содержимое кнопки.
 */
export const BurgerButton = forwardRef<HTMLButtonElement, Props>(
	function BurgerButton({ isOpen, onClick, controls, className }, ref) {
		return (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				data-open={isOpen}
				aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
				aria-expanded={isOpen}
				aria-controls={controls}
				className={cn(
					styles.button,
					"flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 lg:hidden",
					className,
				)}
			>
				<span className={styles.lines} aria-hidden>
					<span className={styles.line} />
					<span className={styles.line} />
				</span>
			</button>
		);
	},
);
