/**
 * modules/productCard/components/ProductImage.tsx
 *
 * Кадр товара в карточке каталога.
 *
 * Геометрия кадра НЕ зависит от снимка. Раньше это было не так только на
 * словах: соотношение сторон было фиксированным, но внутренний отступ задавался
 * в пикселях (p-4), поэтому на узкой карточке широкий снимок превращался в
 * полоску, а вертикальный — в столб от края до края. Здесь отступ задан в
 * процентах: он резолвится от ширины контейнера, а контейнер квадратный, —
 * значит поле вокруг снимка визуально одинаково на любой ширине колонки.
 *
 * Подложка — общий токен --media-plate. Он чуть светлее поверхности карточки,
 * поэтому снимок с залитым белым фоном и снимок с прозрачным фоном садятся на
 * одну и ту же плашку и читаются как один набор, а не как случайная нарезка.
 */

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/utils/cn";
import type { ProductImageProps } from "../types";

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
}: ProductImageProps) {
	const firstMedia = images?.[0];
	const imageUrl = getImageUrl(firstMedia);
	const imageAlt = getImageAlt(firstMedia, `Изображение товара ${productId}`);

	const isUnavailable = status === "out_of_stock" || status === "discontinued";

	return (
		<div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-[var(--hairline)] bg-[var(--media-plate)]">
			{imageUrl ? (
				<Image
					src={imageUrl}
					alt={imageAlt}
					fill
					sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
					preload={priority}
					quality={85}
					// Отступ в процентах от ширины квадратного контейнера — поле вокруг
					// снимка масштабируется вместе с колонкой сетки.
					className={cn(
						"object-contain p-[9%] transition-transform duration-500 ease-out motion-reduce:!transform-none",
						isUnavailable
							? "opacity-45 grayscale"
							: "group-hover:!scale-[1.04]",
					)}
				/>
			) : (
				<div
					className="flex h-full w-full items-center justify-center text-[var(--border-light)]"
					aria-hidden="true"
				>
					<ImageOff className="h-1/5 w-1/5" strokeWidth={1.25} />
				</div>
			)}

			{/* Скидка — единственный бейдж на кадре. Статус наличия ушёл в
			    текстовую строку карточки: два ярлыка поверх снимка спорили друг с
			    другом и закрывали товар. */}
			{hasDiscount && discountPercentage ? (
				<span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-1.5 py-[0.25rem] text-[11px] font-bold leading-none tabular-nums text-white">
					−{discountPercentage}%
				</span>
			) : null}
		</div>
	);
}
