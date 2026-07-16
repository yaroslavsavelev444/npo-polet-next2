"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

interface DropdownItem {
	label: string;
	href: string;
}

interface Props {
	trigger: string;
	items: DropdownItem[];
	/**
	 * По какому краю триггера выравнивать выпадающую панель. Для меню у
	 * правого края навбара (профиль) "left" уводит панель за границу экрана —
	 * она шире самого триггера.
	 */
	align?: "left" | "right";
}

/**
 * Меню в навбаре: открывается ТОЛЬКО по клику (повторный клик закрывает),
 * закрывается кликом вне, Escape и переходом по пункту.
 *
 * Открытия по hover здесь намеренно нет. На тач-устройствах его нечем
 * воспроизвести, а браузер синтезирует из тапа mouseenter — меню открывалось
 * по нему и тут же закрывалось пришедшим следом onClick. На desktop была
 * обратная сторона той же проблемы: hover уже открыл меню, поэтому клик по
 * триггеру читался как «закрыть».
 */
export default function DropdownMenu({
	trigger,
	items,
	align = "left",
}: Props) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		// Глобальные обработчики нужны только пока меню открыто.
		if (!isOpen) return;

		// pointerdown, а не mousedown: одно событие покрывает и мышь, и тач.
		const handlePointerDown = (e: PointerEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsOpen(false);
				// Иначе после закрытия фокус остаётся на пункте, которого больше нет в DOM.
				triggerRef.current?.focus();
			}
		};

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={containerRef} className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-controls={isOpen ? menuId : undefined}
				className="flex items-center gap-1.5 text-sm font-medium text-white hover:text-white/80 transition-colors"
			>
				{trigger}
				<ChevronDown
					size={16}
					aria-hidden
					className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>

			{isOpen && (
				<div
					id={menuId}
					role="menu"
					aria-label={trigger}
					className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-2 min-w-[200px] rounded-2xl bg-[#1f252e]/95 backdrop-blur-2xl border border-white/10 shadow-2xl py-2 z-50`}
				>
					{items.map((item) => (
						<Link
							key={item.href}
							role="menuitem"
							href={item.href}
							className="block px-5 py-2.5 text-sm hover:bg-white/5 transition-colors"
							onClick={() => setIsOpen(false)}
						>
							{item.label}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
