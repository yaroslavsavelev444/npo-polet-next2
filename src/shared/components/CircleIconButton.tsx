"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

export type CircleIconButtonTone = "solid" | "glass";
export type CircleIconButtonSize = "sm" | "md";

interface CircleIconButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement> {
	active?: boolean;
	/**
	 * "solid" — поверхность витрины с тенью. Кнопка лежит НА странице, рядом с
	 * текстом (блок покупки на странице товара).
	 *
	 * "glass" — тонкое кольцо по разлиновке с размытием подложки. Кнопка лежит
	 * НА КАДРЕ товара, поверх снимка: плотная плашка с тенью читалась там
	 * третьим прямоугольником и спорила с изображением. Тот же материал, что у
	 * кнопки закрытия в панели корзины.
	 */
	tone?: CircleIconButtonTone;
	size?: CircleIconButtonSize;
	children: ReactNode;
}

const toneStyles: Record<CircleIconButtonTone, string> = {
	solid:
		"bg-[var(--surface)]/90 shadow-[0_2px_10px_var(--shadow-color)] hover:scale-105",
	glass:
		"border border-[var(--rule)] bg-[var(--void)]/55 hover:border-[var(--border-light)]",
};

const sizeStyles: Record<CircleIconButtonSize, string> = {
	sm: "h-8 w-8",
	md: "h-9 w-9",
};

/**
 * Круглая иконочная кнопка для действий поверх медиа и рядом с ним (избранное,
 * быстрый просмотр). Общая, чтобы каждое место применения не собирало
 * собственную абсолютно позиционированную кнопку со своим размером, своим
 * размытием и своим наведением.
 */
export function CircleIconButton({
	active = false,
	tone = "solid",
	size = "md",
	className,
	children,
	...props
}: CircleIconButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full",
				"text-[var(--text-secondary)] backdrop-blur-sm",
				"transition-all duration-150 ease-out",
				"hover:text-[var(--text-primary)]",
				"disabled:pointer-events-none disabled:opacity-50",
				sizeStyles[size],
				toneStyles[tone],
				active && "text-[var(--error)]",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}

export default CircleIconButton;
