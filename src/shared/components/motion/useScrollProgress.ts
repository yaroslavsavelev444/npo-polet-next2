"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Прогресс прохождения элемента через окно, записанный в CSS-переменную --p.
 *
 * Почему переменная, а не состояние React: прогресс меняется на каждом кадре
 * прокрутки. Через useState это 60 ре-рендеров в секунду на каждую секцию —
 * гарантированные пропуски кадров на слабом устройстве. Запись в CSS-custom
 * property не трогает React вообще: значение читают правила в home.css
 * (`.p-parallax` и подобные), пересчёт идёт на стиле и композиторе.
 *
 * Модель прогресса (`mode`):
 *  - "cover"  — 0 в момент, когда верх элемента касается низа окна; 1 в
 *               момент, когда низ элемента касается верха окна. Годится для
 *               параллакса: элемент участвует всё время, пока виден.
 *  - "sticky" — 0 в момент, когда элемент упёрся в верх окна; 1 когда его
 *               низ дошёл до низа окна. Это ровно тот отрезок, на котором
 *               липкий блок «стоит», — им управляются схема принципа
 *               действия и хронология.
 *
 * Значение не выходит за [0, 1]: клампинг здесь, а не в CSS, потому что
 * clamp() в каждом потребителе — это повторение одного и того же правила в
 * пяти местах.
 */

type ProgressMode = "cover" | "sticky";

interface Options {
	mode?: ProgressMode;
	/** Имя CSS-переменной. По умолчанию --p. */
	property?: string;
	/**
	 * Куда писать. По умолчанию в сам наблюдаемый элемент; можно указать
	 * отдельную цель (например, писать в секцию, а измерять её внутренний
	 * трек).
	 */
	targetRef?: RefObject<HTMLElement | null>;
}

export function useScrollProgress<T extends HTMLElement = HTMLDivElement>(
	options: Options = {},
) {
	const { mode = "cover", property = "--p", targetRef } = options;
	const ref = useRef<T | null>(null);
	// Последнее записанное значение: запись в style дорогая, а прогресс между
	// соседними кадрами часто не меняется в третьем знаке. Пропуск таких
	// записей заметно снижает время на пересчёт стилей при быстром скролле.
	const lastRef = useRef<number>(-1);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		const target = targetRef?.current ?? node;

		// Пользователь просил меньше движения — фиксируем прогресс на
		// середине. Все зависимые эффекты (параллакс, поворот схемы) встают в
		// нейтральное положение вместо того, чтобы дёргаться.
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (reduceMotion.matches) {
			target.style.setProperty(property, "0.5");
			return;
		}

		let frame = 0;
		let visible = true;

		const measure = () => {
			frame = 0;
			const rect = node.getBoundingClientRect();
			const viewport = window.innerHeight;

			let raw: number;
			if (mode === "sticky") {
				// Длина «залипания» — путь, который элемент проходит,
				// упираясь в верх окна.
				const distance = rect.height - viewport;
				raw = distance <= 0 ? 0 : -rect.top / distance;
			} else {
				const distance = viewport + rect.height;
				raw = distance <= 0 ? 0 : (viewport - rect.top) / distance;
			}

			const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
			// Три знака достаточно: на 1000px хода это шаг в один пиксель.
			const rounded = Math.round(clamped * 1000) / 1000;
			if (rounded === lastRef.current) return;
			lastRef.current = rounded;
			target.style.setProperty(property, String(rounded));
		};

		const schedule = () => {
			if (!visible || frame) return;
			frame = requestAnimationFrame(measure);
		};

		// Пока секция за пределами окна, считать нечего: наблюдатель снимает
		// нагрузку со страницы, на которой таких секций несколько.
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (visible) schedule();
			},
			{ rootMargin: "10% 0px" },
		);
		observer.observe(node);

		measure();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule, { passive: true });

		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [mode, property, targetRef]);

	return ref;
}
