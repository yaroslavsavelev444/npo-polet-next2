"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ProductDetailImage } from "../../types";

/** Порог свайпа в пикселях, после которого меняем изображение. */
const SWIPE_THRESHOLD = 45;

export interface GalleryNavigation {
	goTo: (index: number) => void;
	goNext: () => void;
	goPrev: () => void;
}

/**
 * Навигация по галерее с зацикливанием (последнее → первое). Вынесено в хук,
 * чтобы одинаково работало и во встроенной галерее, и в полноэкранном
 * просмотрщике, и не дублировать логику индексов.
 */
export function useGalleryNavigation(
	length: number,
	activeIndex: number,
	setActiveIndex: (index: number) => void,
): GalleryNavigation {
	const goTo = useCallback(
		(index: number) => {
			if (length === 0) return;
			setActiveIndex(((index % length) + length) % length);
		},
		[length, setActiveIndex],
	);

	const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
	const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

	return { goTo, goNext, goPrev };
}

/**
 * Обработчики свайпа для тач-устройств. Реагирует только на горизонтальный
 * жест (порог по X больше, чем по Y) — чтобы вертикальный скролл страницы
 * не перехватывался галереей.
 */
export function useSwipe(onNext: () => void, onPrev: () => void) {
	const start = useRef<{ x: number; y: number } | null>(null);

	return {
		onTouchStart: (e: React.TouchEvent) => {
			const t = e.touches[0];
			start.current = { x: t.clientX, y: t.clientY };
		},
		onTouchEnd: (e: React.TouchEvent) => {
			if (!start.current) return;
			const t = e.changedTouches[0];
			const dx = t.clientX - start.current.x;
			const dy = t.clientY - start.current.y;
			start.current = null;
			if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
			if (dx < 0) onNext();
			else onPrev();
		},
	};
}

/**
 * Предзагрузка соседних изображений (предыдущее и следующее). Лениво грузить
 * галерею не нужно (по требованию) — наоборот, соседей подгружаем заранее,
 * чтобы переключение и свайп были мгновенными без «прыжка» пустого кадра.
 * В DOM при этом держим лишь активный кадр — так галерея переваривает и 50+
 * фотографий без лишней разметки.
 */
export function useAdjacentPreload(
	images: ProductDetailImage[],
	activeIndex: number,
) {
	useEffect(() => {
		if (images.length < 2) return;
		const neighbors = [
			images[(activeIndex + 1) % images.length],
			images[(activeIndex - 1 + images.length) % images.length],
		];
		for (const image of neighbors) {
			if (!image?.url) continue;
			const img = new Image();
			img.src = image.url;
		}
	}, [images, activeIndex]);
}

/** Прокручивает активную миниатюру в зону видимости внутри её контейнера. */
export function useScrollActiveThumbnailIntoView(activeIndex: number) {
	const stripRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const strip = stripRef.current;
		if (!strip) return;
		const active = strip.querySelector<HTMLElement>(
			`[data-thumb-index="${activeIndex}"]`,
		);
		active?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}, [activeIndex]);

	return stripRef;
}
