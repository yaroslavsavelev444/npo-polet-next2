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
 * Выпадающее меню в шапке (сейчас — меню профиля).
 *
 * Мышью открывается наведением — так же, как пункты навигации рядом (см.
 * NavMenus): в шапке одна логика на все меню. Клик тоже работает и нужен
 * пальцу и клавиатуре: переключает меню. Закрывается уходом курсора, кликом
 * вне, Escape и переходом по пункту.
 *
 * Прежняя проблема наведения — тап синтезирует mouseenter, меню открывалось
 * и тут же закрывалось пришедшим следом кликом — снята проверкой pointerType:
 * касание пальцем событием наведения не считается.
 */
const OPEN_DELAY_MS = 70;
const CLOSE_DELAY_MS = 200;

export default function DropdownMenu({
	trigger,
	items,
	align = "left",
}: Props) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();
	const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPointer = useRef<string>("");

	const schedule = (open: boolean) => {
		if (hoverTimer.current) clearTimeout(hoverTimer.current);
		hoverTimer.current = setTimeout(
			() => setIsOpen(open),
			open ? OPEN_DELAY_MS : CLOSE_DELAY_MS,
		);
	};

	useEffect(
		() => () => {
			if (hoverTimer.current) clearTimeout(hoverTimer.current);
		},
		[],
	);

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
		<div
			ref={containerRef}
			className="relative"
			onPointerEnter={(event) => {
				if (event.pointerType === "mouse") schedule(true);
			}}
			onPointerLeave={(event) => {
				if (event.pointerType === "mouse") schedule(false);
			}}
		>
			<button
				ref={triggerRef}
				type="button"
				onPointerDown={(event) => {
					lastPointer.current = event.pointerType;
				}}
				onClick={() => {
					if (hoverTimer.current) clearTimeout(hoverTimer.current);
					// Мышью меню к клику уже открыто наведением: клик его не
					// закрывает, а подтверждает. Переключает — палец и клавиатура.
					if (lastPointer.current === "mouse") {
						lastPointer.current = "";
						setIsOpen(true);
						return;
					}
					setIsOpen((open) => !open);
				}}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-controls={isOpen ? menuId : undefined}
				className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-primary)] hover:text-[color:var(--text-secondary)] transition-colors"
			>
				{/* Длинное имя не должно раздвигать шапку: обрезается многоточием. */}
				<span className="max-w-[10rem] truncate">{trigger}</span>
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
					className={`absolute top-full ${align === "right" ? "right-0" : "left-0"} mt-2 min-w-[200px] rounded-2xl bg-[var(--surface)]/95 backdrop-blur-2xl border border-[var(--text-primary)]/10 shadow-2xl py-2 z-50`}
				>
					{items.map((item) => (
						<Link
							key={item.href}
							role="menuitem"
							href={item.href}
							className="block px-5 py-2.5 text-sm hover:bg-[var(--text-primary)]/5 transition-colors"
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
