"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/UI";
import { cn } from "@/utils/cn";
import type { ProductDetailImage } from "../types";

interface ProductGalleryProps {
  images: ProductDetailImage[];
  title: string;
}

export function ProductGallery({ images, title }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setLightboxOpen] = useState(false);

  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;
  const activeImage = hasImages ? images[activeIndex] : null;

  const goTo = useCallback(
    (index: number) => {
      if (images.length === 0) return;
      setActiveIndex((index + images.length) % images.length);
    },
    [images.length],
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen, goNext, goPrev]);

  if (!hasImages || !activeImage) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] text-sm text-[var(--text-muted)]">
        Нет изображений
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        Изображение {activeIndex + 1} из {images.length}
      </p>

      <div className="group relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Открыть изображение на весь экран"
          className="absolute inset-0 z-0"
        >
          <Image
            src={activeImage.url}
            alt={activeImage.alt || title}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-4"
          />
        </button>

        <span className="pointer-events-none absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Expand className="h-4 w-4" />
        </span>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Предыдущее изображение"
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--text-primary)] opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Следующее изображение"
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--text-primary)] opacity-0 shadow-md transition-opacity group-hover:opacity-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Показать изображение ${index + 1}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border transition-colors",
                index === activeIndex
                  ? "border-[var(--primary)]"
                  : "border-[var(--border)] hover:border-[var(--border-light)]",
              )}
            >
              <Image
                src={image.url}
                alt={image.alt || title}
                fill
                sizes="64px"
                className="object-contain p-1"
              />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={isLightboxOpen}
        onClose={() => setLightboxOpen(false)}
        width="min(92vw, 1100px)"
      >
        <div className="relative aspect-square w-full">
          <Image
            src={activeImage.url}
            alt={activeImage.alt || title}
            fill
            sizes="92vw"
            className="object-contain"
          />
        </div>

        {hasMultiple && (
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Предыдущее изображение"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              {activeIndex + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              aria-label="Следующее изображение"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
