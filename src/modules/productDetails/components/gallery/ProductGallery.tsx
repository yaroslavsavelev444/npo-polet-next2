"use client";

import { ChevronLeft, ChevronRight, Expand, ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/utils/cn";
import type { ProductDetailImage } from "../../types";
import { GalleryLightbox } from "./GalleryLightbox";
import {
	useAdjacentPreload,
	useGalleryNavigation,
	useScrollActiveThumbnailIntoView,
	useSwipe,
} from "./useGallery";

interface ProductGalleryProps {
	images: ProductDetailImage[];
	title: string;
}

/**
 * Предел ширины стоит на самом кадре, а не на всей галерее.
 *
 * Кадр квадратный, поэтому его высота равна его ширине: в широкой левой
 * колонке страницы (~800 px) он без ограничения вырастал на весь первый
 * экран. Ограничивать при этом обёртку было нельзя — тогда товар с одним
 * снимком (нет рейки миниатюр) получал кадр на 80 px больше, чем товар с
 * пятью, и один и тот же экран выглядел по-разному от товара к товару.
 * С пределом на кадре его размер одинаков в обоих случаях.
 */
const FRAME_WIDTH = "w-full max-w-[35rem]";

/**
 * Галерея изображений товара: крупный кадр, лента миниатюр, стрелки, свайп на
 * тач-устройствах и полноэкранный просмотрщик (GalleryLightbox). В DOM всегда
 * лишь активный кадр — соседи предзагружаются в память (useAdjacentPreload),
 * поэтому и переключение мгновенное, и 50+ фотографий не раздувают разметку.
 */
export function ProductGallery({ images, title }: ProductGalleryProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [lightboxOpen, setLightboxOpen] = useState(false);

	const { goNext, goPrev } = useGalleryNavigation(
		images.length,
		activeIndex,
		setActiveIndex,
	);
	const swipe = useSwipe(goNext, goPrev);
	const thumbRef = useScrollActiveThumbnailIntoView(activeIndex);
	useAdjacentPreload(images, activeIndex);

	if (images.length === 0) {
		return (
			<div
				className={cn(
					FRAME_WIDTH,
					"flex aspect-square flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--media-plate)] text-[var(--text-muted)]",
				)}
			>
				<ImageOff className="h-10 w-10" aria-hidden />
				<span className="text-sm">Нет изображений</span>
			</div>
		);
	}

	const active = images[activeIndex];
	const hasMultiple = images.length > 1;

	return (
		<div
			className={cn(
				"w-full",
				// На десктопе миниатюры стоят вертикальной рейкой справа от кадра:
				// видно больше кадров сразу и не нужен горизонтальный скролл.
				// Именно справа, а не слева, — тогда левый край кадра совпадает с
				// левым краем описания и характеристик под ним. На узком экране
				// рейка разворачивается в ленту под кадром.
				"flex flex-col gap-3 lg:flex-row lg:gap-4",
			)}
		>
			<p className="sr-only" aria-live="polite">
				Изображение {activeIndex + 1} из {images.length}
			</p>

			{/* Основной кадр */}
			<div
				className={cn(
					FRAME_WIDTH,
					"group relative aspect-square min-w-0 shrink overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--media-plate)]",
				)}
				{...swipe}
			>
				<button
					type="button"
					onClick={() => setLightboxOpen(true)}
					aria-label="Открыть изображение на весь экран"
					className="absolute inset-0 cursor-zoom-in"
				>
					<Image
						key={active.url}
						src={active.url}
						alt={active.alt || title}
						fill
						priority
						sizes="(max-width: 1024px) 100vw, 544px"
						className="object-contain p-[7%]"
					/>
				</button>

				<span className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
					<Expand className="h-4 w-4" />
				</span>

				{hasMultiple && (
					<>
						<GalleryArrow side="left" onClick={goPrev} />
						<GalleryArrow side="right" onClick={goNext} />
						<span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-[0.25rem] text-xs font-medium tabular-nums text-white">
							{activeIndex + 1} / {images.length}
						</span>
					</>
				)}
			</div>

			{/* Миниатюры: лента снизу на мобильном, рейка слева на десктопе */}
			{hasMultiple && (
				<div
					ref={thumbRef}
					className="flex shrink-0 gap-2 overflow-x-auto pb-[0.25rem] [scrollbar-width:thin] lg:max-h-[560px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0 lg:pr-[0.25rem]"
				>
					{images.map((image, index) => (
						<button
							key={`${image.url}-${index}`}
							type="button"
							data-thumb-index={index}
							onClick={() => setActiveIndex(index)}
							aria-label={`Показать изображение ${index + 1}`}
							aria-current={index === activeIndex}
							className={cn(
								"relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border bg-[var(--media-plate)] transition-colors",
								index === activeIndex
									? "border-[var(--primary)]"
									: "border-[var(--hairline)] opacity-60 hover:opacity-100",
							)}
						>
							<Image
								src={image.url}
								alt=""
								fill
								sizes="64px"
								className="object-contain p-1.5"
							/>
						</button>
					))}
				</div>
			)}

			{lightboxOpen && (
				<GalleryLightbox
					images={images}
					title={title}
					index={activeIndex}
					onIndexChange={setActiveIndex}
					onClose={() => setLightboxOpen(false)}
				/>
			)}
		</div>
	);
}

function GalleryArrow({
	side,
	onClick,
}: {
	side: "left" | "right";
	onClick: () => void;
}) {
	const Icon = side === "left" ? ChevronLeft : ChevronRight;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={
				side === "left" ? "Предыдущее изображение" : "Следующее изображение"
			}
			className={cn(
				"absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full",
				"bg-white/90 text-[var(--text-dark)] shadow-md transition-opacity duration-150",
				"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
				// На тач-устройствах (hover недоступен) стрелки видны сразу.
				"[@media(hover:none)]:opacity-100",
				side === "left" ? "left-2" : "right-2",
			)}
		>
			<Icon className="h-5 w-5" />
		</button>
	);
}
