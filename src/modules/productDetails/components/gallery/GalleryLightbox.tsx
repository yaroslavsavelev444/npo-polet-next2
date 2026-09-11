"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RemoveScroll } from "react-remove-scroll";
import { cn } from "@/utils/cn";
import type { ProductDetailImage } from "../../types";
import styles from "../ProductPage.module.css";
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
 *
 * Материал слоя — --void-deep с размытием, разлиновка --rule, моноширинный
 * счётчик: тот же язык, что у панели корзины и всплывающих окон каталога.
 * Чистый чёрный, стоявший здесь раньше, на этой витрине читается провалом, а
 * не слоем над страницей.
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
			{/* Нажатие по фону закрывает просмотр. Это ускоритель для указателя,
			    а не единственный путь наружу: с клавиатуры работают Escape и
			    кнопка закрытия в шапке слоя. */}
			<div
				className={styles.lightbox}
				role="dialog"
				aria-modal="true"
				aria-label="Просмотр изображений товара"
				onClick={onClose}
			>
				<div className={styles.lightboxHead}>
					<span className={styles.micro}>
						{index + 1} / {images.length}
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Закрыть просмотр"
						className={styles.lightboxButton}
					>
						<X className="h-4 w-4" aria-hidden />
					</button>
				</div>

				<div className={styles.lightboxStage} {...swipe}>
					{active && (
						<div className="relative h-full w-full">
							<Image
								key={active.url}
								src={active.url}
								alt={active.alt || title}
								fill
								sizes="100vw"
								className={styles.lightboxImage}
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					)}

					{hasMultiple && (
						<>
							<button
								type="button"
								aria-label="Предыдущее изображение"
								onClick={(e) => {
									e.stopPropagation();
									goPrev();
								}}
								className={cn(
									styles.lightboxButton,
									styles.lightboxArrow,
									styles.lightboxArrowPrev,
								)}
							>
								<ChevronLeft className="h-5 w-5" aria-hidden />
							</button>
							<button
								type="button"
								aria-label="Следующее изображение"
								onClick={(e) => {
									e.stopPropagation();
									goNext();
								}}
								className={cn(
									styles.lightboxButton,
									styles.lightboxArrow,
									styles.lightboxArrowNext,
								)}
							>
								<ChevronRight className="h-5 w-5" aria-hidden />
							</button>
						</>
					)}
				</div>

				{hasMultiple && (
					// Остановка всплытия нужна, чтобы выбор миниатюры не закрывал
					// просмотр обработчиком фона; собственного поведения у обёртки
					// нет.
					<div
						ref={thumbRef}
						className={styles.lightboxRail}
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
								className={styles.thumb}
							>
								<Image
									src={image.url}
									alt=""
									fill
									sizes="64px"
									className={styles.thumbImage}
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
