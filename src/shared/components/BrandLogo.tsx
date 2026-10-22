import Image from "next/image";
import { cn } from "@/utils/cn";
import styles from "./BrandLogo.module.css";

/**
 * Фирменный знак «Полёт» в двух вариантах: чёрный для светлой темы, белый
 * для тёмной. Отрисованы оба, видимый выбирает CSS (см. модуль стилей).
 *
 * Скрытый вариант (display: none) выпадает и из дерева доступности, поэтому
 * подпись у обоих одна и та же — читалка видит ровно один знак.
 *
 * Высоту задаёт обёртка через className, ширина — по пропорциям файла.
 */
export function BrandLogo({
	alt,
	className,
}: {
	alt: string;
	className?: string;
}) {
	return (
		<span className={cn("inline-block", className)}>
			<Image
				src="/brand/polet-logo-black.png"
				alt={alt}
				width={318}
				height={240}
				// Знак в шапке виден сразу — без ленивой загрузки (как было у <img>).
				loading="eager"
				className={cn(styles.logo, styles.onLight)}
			/>
			<Image
				src="/brand/polet-logo-white.png"
				alt={alt}
				width={318}
				height={240}
				loading="eager"
				className={cn(styles.logo, styles.onDark)}
			/>
		</span>
	);
}
