"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import { cn } from "@/utils/cn";
import type { ProductDetailImage } from "../../types";
import {
	useAdjacentPreload,
	useGalleryNavigation,
	useScrollActiveThumbnailIntoView,
	useSwipe,
} from "./useGallery";

interface GalleryLightboxProps {
	images: ProductDetailImage[];
	title: string;
	index: number;
	onIndexChange: (index: number) => void;
	onClose: () => void;
}

/**
 * Полноэкранный просмотрщик изображений. Отдельный слой поверх страницы
 * (портал в body), а не «раздутая» карточка: закрывается по ESC и клику по
 * фону, листается стрелками, свайпом и клавишами ←/→, показывает счётчик и
 * ленту миниатюр. Скролл страницы под ним заблокирован (RemoveScroll).
 */
export function GalleryLightbox({
	images,
	title,
	index,
	onIndexChange,
	onClose,
}: GalleryLightboxProps) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const { goNext, goPrev } = useGalleryNavigation(
		images.length,
		index,
		onIndexChange,
	);
	const swipe = useSwipe(goNext, goPrev);
	const thumbRef = useScrollActiveThumbnailIntoView(index);
	useAdjacentPreload(images, index);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowRight") goNext();
			else if (e.key === "ArrowLeft") goPrev();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onClose, goNext, goPrev]);

	if (!mounted) return null;

	const active = images[index];
	const hasMultiple = images.length > 1;

	return createPortal(
		<RemoveScroll>
			<div
				className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
				role="dialog"
				aria-modal="true"
				aria-label="Просмотр изображений товара"
				onClick={onClose}
			>
				{/* Верхняя панель: счётчик + закрыть */}
				<div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
					<span className="text-sm tabular-nums text-white/80">
						{index + 1} / {images.length}
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Закрыть просмотр"
						className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Основное изображение */}
				<div
					className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14"
					{...swipe}
				>
					{active && (
						<div className="relative h-full w-full">
							<Image
								key={active.url}
								src={active.url}
								alt={active.alt || title}
								fill
								sizes="100vw"
								className="object-contain"
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					)}

					{hasMultiple && (
						<>
							<LightboxArrow
								side="left"
								onClick={(e) => {
									e.stopPropagation();
									goPrev();
								}}
							/>
							<LightboxArrow
								side="right"
								onClick={(e) => {
									e.stopPropagation();
									goNext();
								}}
							/>
						</>
					)}
				</div>

				{/* Лента миниатюр */}
				{hasMultiple && (
					<div
						ref={thumbRef}
						className="flex gap-2 overflow-x-auto px-4 py-4 sm:px-6"
						onClick={(e) => e.stopPropagation()}
					>
						{images.map((image, i) => (
							<button
								key={`${image.url}-${i}`}
								type="button"
								data-thumb-index={i}
								onClick={() => onIndexChange(i)}
								aria-label={`Изображение ${i + 1}`}
								aria-current={i === index}
								className={cn(
									"relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-opacity sm:h-16 sm:w-16",
									i === index
										? "border-white opacity-100"
										: "border-transparent opacity-50 hover:opacity-100",
								)}
							>
								<Image
									src={image.url}
									alt=""
									fill
									sizes="64px"
									className="object-cover"
								/>
							</button>
						))}
					</div>
				)}
			</div>
		</RemoveScroll>,
		document.body,
	);
}

function LightboxArrow({
	side,
	onClick,
}: {
	side: "left" | "right";
	onClick: (e: React.MouseEvent) => void;
}) {
	const Icon = side === "left" ? ChevronLeft : ChevronRight;
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={side === "left" ? "Предыдущее" : "Следующее"}
			className={cn(
				"absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors",
				"bg-white/10 hover:bg-white/20",
				side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4",
			)}
		>
			<Icon className="h-6 w-6" />
		</button>
	);
}
