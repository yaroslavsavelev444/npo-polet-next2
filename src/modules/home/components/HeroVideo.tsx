"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoSource } from "../lib/media";

/**
 * Фоновое видео первого экрана.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЭТО НЕ ПРОСТО <video autoplay loop muted>
 * ────────────────────────────────────────────────────────────────────────────
 * Фоновое видео — самый дорогой элемент страницы и единственный, который
 * легко делает её неюзабельной на плохой связи. Поэтому оно загружается не
 * всегда, а только когда это оправдано:
 *
 *  1. `preload="none"` и НИ ОДНОГО <source> в серверной разметке. Пока
 *     решение не принято, браузер не запрашивает ни байта видео — виден
 *     постер. Источники добавляются из эффекта уже после гидратации, то есть
 *     видео физически не может конкурировать за канал с LCP-кадром, шрифтом
 *     и JS.
 *  2. Экономия трафика (`saveData`) и медленное соединение (2g/3g) — видео
 *     не грузится вовсе.
 *  3. `prefers-reduced-motion` — не грузится: движущийся фон во весь экран
 *     это ровно тот случай, ради которого настройку и придумали.
 *  4. Узкий экран получает отдельный, более лёгкий файл. Выбор делается на
 *     клиенте: атрибут media у <source> внутри <video> браузеры игнорируют
 *     (он работает только в <picture>), и полагаться на него нельзя.
 *  5. Видео останавливается, когда уезжает из кадра, и когда вкладка ушла в
 *     фон. Декодирование кадров, которых никто не видит, — это разряженный
 *     аккумулятор и ничего больше.
 *
 * Постер при этом отдаётся всегда и является настоящим LCP-элементом: он
 * должен быть лёгким (см. README модуля).
 */

interface HeroVideoProps {
	sources: VideoSource[];
	mobileSources: VideoSource[];
	poster: string | null;
	/** Ширина окна, ниже которой берётся мобильный файл. */
	mobileBreakpoint?: number;
	className?: string;
}

type NetworkInformation = {
	saveData?: boolean;
	effectiveType?: string;
};

function shouldLoadVideo(): boolean {
	if (typeof window === "undefined") return false;

	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return false;
	}

	const connection = (
		navigator as Navigator & { connection?: NetworkInformation }
	).connection;

	if (connection?.saveData) return false;
	if (
		connection?.effectiveType &&
		/(^|-)(2g|slow-2g)$/.test(connection.effectiveType)
	) {
		return false;
	}

	return true;
}

export function HeroVideo({
	sources,
	mobileSources,
	poster,
	mobileBreakpoint = 768,
	className,
}: HeroVideoProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	// Видимость постера снимается только после первого отрисованного кадра:
	// иначе между «видео начало грузиться» и «есть что показать» мелькает
	// чёрный прямоугольник.
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (!shouldLoadVideo()) return;

		const isNarrow = window.matchMedia(
			`(max-width: ${mobileBreakpoint - 1}px)`,
		).matches;
		const list = isNarrow && mobileSources.length ? mobileSources : sources;
		if (!list.length) return;

		for (const source of list) {
			const element = document.createElement("source");
			element.src = source.src;
			element.type = source.type;
			video.appendChild(element);
		}
		video.load();

		const onPlaying = () => setPlaying(true);
		video.addEventListener("playing", onPlaying);

		// Автовоспроизведение может быть отклонено политикой браузера — это
		// штатная ситуация, а не ошибка: остаётся постер, страница цела.
		const tryPlay = () => {
			void video.play().catch(() => undefined);
		};

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					tryPlay();
				} else {
					video.pause();
				}
			},
			{ threshold: 0.05 },
		);
		observer.observe(video);

		const onVisibility = () => {
			if (document.hidden) {
				video.pause();
			} else if (video.getBoundingClientRect().bottom > 0) {
				tryPlay();
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			video.removeEventListener("playing", onPlaying);
			video.pause();
			// Источники снимаются вручную: без этого React при повторном
			// монтировании (StrictMode в разработке) добавит второй комплект.
			while (video.firstChild) video.removeChild(video.firstChild);
		};
	}, [sources, mobileSources, mobileBreakpoint]);

	return (
		<video
			ref={videoRef}
			// Декоративный фон: содержание первого экрана несёт текст, а не
			// ролик. Скринридеру объявлять его нечем и незачем.
			aria-hidden="true"
			tabIndex={-1}
			className={className}
			poster={poster ?? undefined}
			preload="none"
			muted
			loop
			playsInline
			// disablePictureInPicture и controls={false} — чтобы длинное
			// удержание на iOS не предлагало «сохранить видео» и не открывало
			// системные элементы поверх первого экрана.
			disablePictureInPicture
			controls={false}
			data-playing={playing}
		/>
	);
}
