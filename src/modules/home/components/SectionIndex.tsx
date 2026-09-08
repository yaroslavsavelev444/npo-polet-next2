"use client";

import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { sectionIndex } from "../content/home-content";

/**
 * Индекс секций — липкий указатель по левому краю.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗДЕСЬ ЕСТЬ НОМЕРА
 * ────────────────────────────────────────────────────────────────────────────
 * Нумерация 01…09 в оформлении обычно ничего не значит и работает как
 * украшение. Здесь она несёт ровно ту информацию, ради которой существует
 * указатель на длинной странице: сколько всего разделов, какой идёт сейчас и
 * сколько осталось. Тот же номер НЕ повторяется над заголовками секций —
 * там он был бы именно украшением.
 *
 * Показывается только на широких экранах: на планшете и телефоне он отнял бы
 * место у контента, а роль «где я» там выполняет обычная прокрутка.
 *
 * Доступность: это настоящая навигация (<nav> со списком ссылок на якоря), а
 * не набор кнопок с обработчиками. Такой указатель работает без JS, попадает
 * в обход по Tab и уважает системную настройку плавной прокрутки.
 */

export function SectionIndex() {
	const [activeId, setActiveId] = useState<string | null>(null);
	// Указатель появляется только после первого экрана: поверх hero он
	// спорил бы с заголовком, ради которого этот экран сделан.
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const sections = sectionIndex
			.map(({ id }) => document.getElementById(id))
			.filter((node): node is HTMLElement => Boolean(node));

		if (!sections.length) return;

		// Активной считается секция, пересекающая горизонтальную линию на
		// трети высоты окна. Это устойчивее, чем «первая видимая»: короткая
		// секция между двумя длинными иначе никогда не станет активной.
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) setActiveId(entry.target.id);
				}
			},
			{ rootMargin: "-33% 0px -60% 0px", threshold: 0 },
		);

		for (const section of sections) observer.observe(section);

		const first = sections[0];
		const onScroll = () => {
			setVisible(first.getBoundingClientRect().top <= window.innerHeight * 0.5);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });

		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
		};
	}, []);

	return (
		//
		// Активное и скрытое состояния навешиваются условными классами, а НЕ
		// вариантами вида data-[visible=true]: и group-data-[active=true]:.
		// Tailwind в этом проекте такие варианты молча не генерирует — в
		// собранном CSS нет ни одного правила с [data-…=true], хотя классы
		// стоят в разметке. Внешне это выглядит как «указатель не появляется и
		// не подсвечивает раздел», и найти причину можно только сравнив
		// разметку с содержимым стилей.
		//
		// Условие в JSX от такого не зависит и читается прямо на месте.
		//
		<nav
			aria-label="Разделы страницы"
			className={cn(
				"fixed left-[1.5rem] top-1/2 z-30 hidden -translate-y-1/2 transition-opacity duration-500 xl:block",
				visible
					? "pointer-events-auto opacity-100"
					: "pointer-events-none opacity-0",
			)}
		>
			<ol className="flex list-none flex-col gap-0 p-0">
				{sectionIndex.map((section, index) => {
					const isActive = activeId === section.id;
					return (
						<li key={section.id}>
							<a
								href={`#${section.id}`}
								aria-current={isActive ? "true" : undefined}
								className="group flex items-center gap-2.5 py-1.5 no-underline"
							>
								<span
									className={cn(
										"u-mono text-[0.625rem] tabular-nums transition-colors duration-300",
										isActive
											? "text-[var(--primary)]"
											: "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]",
									)}
								>
									{String(index + 1).padStart(2, "0")}
								</span>
								{/* Штрих удлиняется у активного пункта: положение
								    читается боковым зрением, без чтения текста. */}
								<span
									aria-hidden="true"
									className={cn(
										"h-px transition-all duration-300",
										isActive
											? "w-8 bg-[var(--primary)]"
											: "w-3 bg-[var(--rule)] group-hover:w-5 group-hover:bg-[var(--border-light)]",
									)}
								/>
								<span
									className={cn(
										"u-mono text-[0.625rem] transition-all duration-300",
										isActive
											? "text-[var(--text-primary)] opacity-100"
											: "text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
									)}
								>
									{section.label}
								</span>
							</a>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

/**
 * Полоса прогресса чтения по верхнему краю.
 *
 * Прогресс пишется в CSS-переменную, а ширину считает CSS: при записи через
 * состояние React это был бы ре-рендер на каждый кадр прокрутки.
 */
export function ReadingProgress() {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const bar = document.getElementById("home-progress");
		if (!bar) return;

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			// Полоса, ползущая при каждом движении колеса, — ровно тот
			// периферийный шум, от которого спасает эта настройка.
			return;
		}

		setReady(true);
		let frame = 0;

		const update = () => {
			frame = 0;
			const max = document.documentElement.scrollHeight - window.innerHeight;
			const value = max <= 0 ? 0 : window.scrollY / max;
			bar.style.setProperty(
				"--progress",
				String(Math.min(1, Math.max(0, value))),
			);
		};

		const schedule = () => {
			if (frame) return;
			frame = requestAnimationFrame(update);
		};

		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule, { passive: true });

		return () => {
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);

	return (
		<div
			id="home-progress"
			aria-hidden="true"
			// Условный класс, а не data-[ready=true]: — см. комментарий к
			// навигации выше: такие варианты Tailwind здесь не генерирует, и
			// полоса прогресса осталась бы невидимой навсегда.
			className={cn(
				"pointer-events-none fixed inset-x-0 top-0 z-40 h-px",
				ready ? "opacity-100" : "opacity-0",
			)}
		>
			<div
				className="h-full origin-left bg-[var(--primary)]"
				style={{ transform: "scaleX(var(--progress, 0))" }}
			/>
		</div>
	);
}
