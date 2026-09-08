"use client";

import { useReveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";

/**
 * Линия-разделитель, которая прочерчивается слева направо, когда доходит до
 * кадра.
 *
 * Почему не обычный <Reveal> вокруг .rule-ticked: общее появление на сайте —
 * «наводка на резкость» (clip-path + расфокус), и на линии высотой в один
 * пиксель оно не читается вовсе. Здесь нужен другой вход, поэтому берётся
 * только наблюдатель из useReveal, а состояние переключается собственным
 * атрибутом data-drawn (стили — .rule-draw в app/(frontend)/contacts.css).
 *
 * Компонент декоративен: содержания в нём нет, поэтому aria-hidden.
 */
export function DrawnRule({
	className,
	plain = false,
	delay = 0,
}: {
	className?: string;
	/** Без засечек-шкалы — для разделителей внутри списка. */
	plain?: boolean;
	delay?: number;
}) {
	const { ref, revealed } = useReveal<HTMLDivElement>("block");

	return (
		<div
			ref={ref}
			data-drawn={revealed}
			aria-hidden="true"
			className={cn("rule-draw", plain && "rule-draw--plain", className)}
			style={
				delay
					? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties)
					: undefined
			}
		/>
	);
}
