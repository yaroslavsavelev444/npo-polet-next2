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
			<div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-muted)]">
				<ImageOff className="h-10 w-10" aria-hidden />
				<span className="text-sm">Нет изображений</span>
			</div>
		);
	}

	const active = images[activeIndex];
	const hasMultiple = images.length > 1;

	return (
		<div className="flex flex-col gap-3">
			<p className="sr-only" aria-live="polite">
				Изображение {activeIndex + 1} из {images.length}
			</p>

			{/* Основной кадр */}
			<div
				className="group relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]"
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
						sizes="(max-width: 1024px) 100vw, 45vw"
						className="object-contain p-4"
					/>
				</button>

				<span className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
					<Expand className="h-4 w-4" />
				</span>

				{hasMultiple && (
					<>
						<GalleryArrow side="left" onClick={goPrev} />
						<GalleryArrow side="right" onClick={goNext} />
						<span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white">
							{activeIndex + 1} / {images.length}
						</span>
					</>
				)}
			</div>

			{/* Лента миниатюр */}
			{hasMultiple && (
				<div
					ref={thumbRef}
					className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
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
								"relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-colors",
								index === activeIndex
									? "border-[var(--primary)]"
									: "border-transparent opacity-60 hover:opacity-100",
							)}
						>
							<Image
								src={image.url}
								alt=""
								fill
								sizes="64px"
								className="object-contain p-1"
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
