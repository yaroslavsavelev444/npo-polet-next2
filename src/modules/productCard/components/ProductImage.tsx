/**
 * modules/productCard/components/ProductImage.tsx
 *
 * Кадр товара в карточке каталога — единственная поверхность карточки после
 * того, как контейнер вокруг товара исчез (разбор в шапке
 * ProductCard.module.css).
 *
 * Геометрия кадра НЕ зависит от снимка: контейнер квадратный, поле вокруг
 * снимка задано в процентах от его ширины, поэтому вертикальная панель,
 * широкий блок и марка на прозрачном фоне занимают в сетке одинаковое место.
 *
 * Подложка — общий токен --media-plate. Он чуть светлее витрины, поэтому
 * снимок с залитым белым фоном и снимок с прозрачным фоном садятся на одну
 * плашку и читаются как один набор, а не как случайная нарезка.
 *
 * Оверлейные действия приходят через children, а не рисуются здесь: кадр
 * отвечает за кадр, а какие кнопки на нём лежат, решает карточка. Раньше они
 * были соседями кадра внутри карточки и позиционировались от неё — стоило
 * убрать у карточки контейнер, и «правый верхний угол» стал углом всей
 * колонки, включая текст.
 */

import { ImageOff } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { ProductImageProps } from "../types";
import styles from "./ProductCard.module.css";

function getImageUrl(media: unknown): string | null {
	if (!media || typeof media !== "object") return null;

	const record = media as Record<string, unknown>;
	if (typeof record.url === "string") return record.url;

	const nested = record.image;
	if (nested && typeof nested === "object") {
		const nestedUrl = (nested as Record<string, unknown>).url;
		if (typeof nestedUrl === "string") return nestedUrl;
	}

	return null;
}

function getImageAlt(media: unknown, fallback: string): string {
	if (!media || typeof media !== "object") return fallback;

	const record = media as Record<string, unknown>;
	if (typeof record.alt === "string" && record.alt) return record.alt;

	const nested = record.image;
	if (nested && typeof nested === "object") {
		const nestedAlt = (nested as Record<string, unknown>).alt;
		if (typeof nestedAlt === "string" && nestedAlt) return nestedAlt;
	}

	return fallback;
}

export function ProductImage({
	images,
	productId,
	hasDiscount,
	discountPercentage,
	status,
	priority = false,
	children,
}: ProductImageProps & { children?: ReactNode }) {
	const firstMedia = images?.[0];
	const imageUrl = getImageUrl(firstMedia);
	const imageAlt = getImageAlt(firstMedia, `Изображение товара ${productId}`);

	const isUnavailable = status === "out_of_stock" || status === "discontinued";

	return (
		<div className={styles.frame}>
			{imageUrl ? (
				<Image
					src={imageUrl}
					alt={imageAlt}
					fill
					// Сетка идёт во всю ширину контента (боковой панели фильтров
					// больше нет), поэтому колонка на широком экране — это пятая
					// часть страницы, а не четверть за вычетом панели.
					sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
					preload={priority}
					quality={85}
					className={cn(styles.image, isUnavailable && styles.imageUnavailable)}
				/>
			) : (
				<div className={styles.imageEmpty} aria-hidden="true">
					<ImageOff className="h-1/5 w-1/5" strokeWidth={1.25} />
				</div>
			)}

			{/* Скидка — единственный ярлык на кадре. Статус наличия ушёл в
			    служебную строку под кадром: два ярлыка поверх снимка спорили друг
			    с другом и закрывали товар. */}
			{hasDiscount && discountPercentage ? (
				<span className={styles.discount}>−{discountPercentage}%</span>
			) : null}

			{children}
		</div>
	);
}
