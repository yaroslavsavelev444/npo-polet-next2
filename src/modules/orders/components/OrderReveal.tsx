import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/utils/cn";

interface OrderRevealProps {
	/** Задержка появления в миллисекундах для каскадного эффекта. */
	delay?: number;
	className?: string;
	children: ReactNode;
}

/**
 * Обёртка каскадного появления блока при монтировании. Анимация целиком на CSS
 * (класс `.order-reveal`), поэтому серверный компонент — задержка прокидывается
 * через CSS-переменную. prefers-reduced-motion отключает движение в globals.css.
 */
export function OrderReveal({
	delay = 0,
	className,
	children,
}: OrderRevealProps) {
	return (
		<div
			className={cn("order-reveal", className)}
			style={{ "--order-reveal-delay": `${delay}ms` } as CSSProperties}
		>
			{children}
		</div>
	);
}
