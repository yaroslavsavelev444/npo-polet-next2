"use client";

import type { ReactNode } from "react";
import { useScrollProgress } from "@/shared/components/motion/useScrollProgress";
import { cn } from "@/utils/cn";

/**
 * Кадр с параллаксом: содержимое сдвигается медленнее страницы.
 *
 * Работает через переменную --p, которую пишет useScrollProgress; сам сдвиг
 * считает CSS-правило .p-parallax. Внутренний слой заранее увеличен (scale
 * 1.12), иначе при сдвиге у кадра открывались бы пустые полосы сверху и
 * снизу.
 *
 * Параллакс включается только там, где он действительно добавляет глубину, —
 * на крупных полноширинных кадрах. На мелких превью сдвиг в несколько
 * пикселей неотличим от дрожания.
 */
export function ParallaxFrame({
	children,
	className,
	innerClassName,
	/** Амплитуда сдвига в процентах от высоты кадра. */
	amount = "8%",
}: {
	children: ReactNode;
	className?: string;
	innerClassName?: string;
	amount?: string;
}) {
	const ref = useScrollProgress<HTMLDivElement>({ mode: "cover" });

	return (
		<div ref={ref} className={cn("relative overflow-hidden", className)}>
			<div
				className={cn("p-parallax absolute inset-0", innerClassName)}
				style={{ "--parallax": amount } as React.CSSProperties}
			>
				{children}
			</div>
		</div>
	);
}
