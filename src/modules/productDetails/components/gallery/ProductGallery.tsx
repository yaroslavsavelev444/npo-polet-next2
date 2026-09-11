"use client";

import { ChevronLeft, ChevronRight, Expand, ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useReveal } from "@/shared/components/motion/Reveal";
import { useScrollProgress } from "@/shared/components/motion/useScrollProgress";
import { cn } from "@/utils/cn";
import type { ProductDetailImage } from "../../types";
import styles from "../ProductPage.module.css";
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
 *
 * ─── Вид ────────────────────────────────────────────────────────────────────
 * У кадра больше нет рамки: плашка --media-plate сама отделяет себя от
 * витрины, и обводка поверх неё говорила бы то же самое второй раз. Вместо
 * рамки кадр отмечен уголковыми метками, сходящимися к его границам при
 * наведении, — тот же приём, что отмечает активную карточку в каталоге и
 * активный кадр на главной. Он же сообщает, что по кадру можно нажать.
 *
 * Служебные элементы поверх снимка (стрелки, счётчик, подсказка о развороте)
 * набраны стеклом по разлиновке — тем же материалом, что кнопки над карточкой
 * товара. Прежние белые «таблетки» с тенью принадлежали светлой теме и на
 * тёмной витрине светились.
 *
 * ─── Движение ───────────────────────────────────────────────────────────────
 * Смена кадра — короткое проявление с едва заметным уменьшением: снимок
 * подменяется на одном и том же узле, и без перехода это читается как
 * подёргивание. Подсветка за кадром слегка ведёт за прокруткой (--p от
 * useScrollProgress) — единственный параллакс на странице, и он на
 * НЕинтерактивном слое: сам кадр из-под пальца уводить нельзя.
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
	const glowRef = useScrollProgress<HTMLDivElement>();
	// Вход галереи собственный, а не через <Reveal>: у общего появления в
	// показанном состоянии остаётся clip-path: inset(0) — обрезка ровно по краю
	// блока, — и подсветка, выходящая за границы кадра, была бы срезана. Взят
	// только наблюдатель, состояние переключается атрибутом data-shown.
	const enter = useReveal<HTMLDivElement>("block");
	useAdjacentPreload(images, activeIndex);

	if (images.length === 0) {
		return (
			<div
				ref={enter.ref}
				data-shown={enter.revealed}
				className={cn(
					styles.galleryEnter,
					styles.galleryFrame,
					styles.galleryEmpty,
				)}
			>
				<ImageOff className="h-9 w-9" strokeWidth={1.25} aria-hidden />
				<span className={styles.micro}>Нет изображений</span>
			</div>
		);
	}

	const active = images[activeIndex];
	const hasMultiple = images.length > 1;

	return (
		<div
			ref={enter.ref}
			data-shown={enter.revealed}
			className={cn(
				styles.galleryEnter,
				// row-reverse ставит рейку миниатюр слева от кадра, не меняя
				// порядок в разметке (кадр остаётся первым — он и есть содержание).
				// justify-end в обратном направлении означает «прижать к ЛЕВОМУ
				// краю»: без него кадр, ограниченный по ширине, уезжал к правому
				// краю колонки и терял общий с остальной страницей левый край.
				"flex min-w-0 flex-col gap-3 lg:flex-row-reverse lg:justify-end lg:gap-4",
			)}
		>
			<p className="sr-only" aria-live="polite">
				Изображение {activeIndex + 1} из {images.length}
			</p>

			{/* Сцена кадра. Обёртка нужна дважды: она держит предел ширины (иначе
			    квадратный кадр вырастает на пол-экрана) и она же система координат
			    для подсветки, которая лежит ЗА плашкой (z-index -1) и потому не
			    осветляет снимок. */}
			<div ref={glowRef} className={styles.galleryStage}>
				<span aria-hidden className={styles.galleryGlow} />

				<div className={styles.galleryFrame} {...swipe}>
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
							preload
							sizes="(max-width: 1024px) 100vw, 40vw"
							className={styles.galleryImage}
						/>
					</button>

					<span className={cn(styles.galleryChip, styles.galleryZoom)}>
						<Expand className="h-3 w-3" aria-hidden />
						<span className={styles.micro}>Развернуть</span>
					</span>

					{hasMultiple && (
						<>
							<button
								type="button"
								onClick={goPrev}
								aria-label="Предыдущее изображение"
								className={cn(styles.galleryArrow, styles.galleryArrowPrev)}
							>
								<ChevronLeft className="h-4 w-4" aria-hidden />
							</button>
							<button
								type="button"
								onClick={goNext}
								aria-label="Следующее изображение"
								className={cn(styles.galleryArrow, styles.galleryArrowNext)}
							>
								<ChevronRight className="h-4 w-4" aria-hidden />
							</button>

							<span className={cn(styles.galleryChip, styles.galleryCounter)}>
								<span className={styles.micro}>
									{activeIndex + 1} / {images.length}
								</span>
							</span>
						</>
					)}
				</div>
			</div>

			{/* Миниатюры: лента под кадром на узком экране, колонка слева на
			    широком. Слева, а не справа: колонка миниатюр — служебная, и на
			    левом краю она не разрывает связь между кадром и стоящим правее
			    блоком покупки. */}
			{hasMultiple && (
				<div ref={thumbRef} className={styles.thumbRail}>
					{images.map((image, index) => (
						<button
							key={`${image.url}-${index}`}
							type="button"
							data-thumb-index={index}
							onClick={() => setActiveIndex(index)}
							aria-label={`Показать изображение ${index + 1}`}
							aria-current={index === activeIndex}
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
