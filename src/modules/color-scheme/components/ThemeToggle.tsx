"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/utils/cn";
import {
	applySchemePreference,
	readSchemePreference,
	resolveScheme,
	subscribeToScheme,
} from "../lib/scheme.client";
import styles from "./ColorScheme.module.css";

/**
 * Переключатель темы в шапке.
 *
 * Знак собран из двух деталей фирменного языка сайта: ядро — оранжевая точка
 * логотипа, вокруг — восемь засечек той же шкалы, что разлиновывает секции
 * (длинные по осям, короткие по диагоналям). В тёмной теме засечки
 * втягиваются, ядро вырастает, и тень срезает из него серп.
 *
 * СОСТОЯНИЕ ЗНАКА ЗАДАЁТ CSS, А НЕ REACT. Сервер не знает тему системы, и
 * в режиме «Авто» любое вычисленное на клиенте состояние означало бы, что
 * знак сначала рисуется неверным, а после гидратации перещёлкивается. Здесь
 * знак читает ту же тему, что и вся страница (селекторы по data-scheme и
 * prefers-color-scheme в ColorScheme.module.css), и верен с первого кадра.
 * Анимация — переходы CSS: повторное нажатие разворачивает её с текущего
 * положения, без рывка.
 *
 * Кнопка всегда переключает на противоположную ВИДИМОЙ теме и делает выбор
 * явным. Вернуть «Авто» можно в подвале и в мобильном меню (SchemeSwitch).
 */
export function ThemeToggle({ className }: { className?: string }) {
	// Подпись — единственное, что зависит от вычисленной темы. До гидратации
	// она нейтральная, после — называет действие.
	const target = useSyncExternalStore(
		subscribeToScheme,
		() => (resolveScheme(readSchemePreference()) === "dark" ? "light" : "dark"),
		() => null,
	);

	const label =
		target === "light"
			? "Включить светлую тему"
			: target === "dark"
				? "Включить тёмную тему"
				: "Сменить тему оформления";

	return (
		<button
			type="button"
			className={cn(styles.toggle, className)}
			aria-label={label}
			title={label}
			data-scheme-motion=""
			onClick={(event) => {
				const next =
					resolveScheme(readSchemePreference()) === "dark" ? "light" : "dark";
				applySchemePreference(next, event.currentTarget);
			}}
		>
			<svg viewBox="0 0 24 24" className={styles.glyph} aria-hidden="true">
				<defs>
					<mask id="theme-toggle-cut">
						<rect x="-4" y="-4" width="32" height="32" fill="#fff" />
						<circle className={styles.cut} cx="17.5" cy="7" r="6.6" />
					</mask>
				</defs>
				<circle
					className={styles.core}
					cx="12"
					cy="12"
					r="8"
					mask="url(#theme-toggle-cut)"
				/>
				<g className={styles.ticks}>
					<line x1="12" y1="2.2" x2="12" y2="5.2" />
					<line x1="16.95" y1="7.05" x2="18.2" y2="5.8" />
					<line x1="18.8" y1="12" x2="21.8" y2="12" />
					<line x1="16.95" y1="16.95" x2="18.2" y2="18.2" />
					<line x1="12" y1="18.8" x2="12" y2="21.8" />
					<line x1="7.05" y1="16.95" x2="5.8" y2="18.2" />
					<line x1="2.2" y1="12" x2="5.2" y2="12" />
					<line x1="7.05" y1="7.05" x2="5.8" y2="5.8" />
				</g>
			</svg>
		</button>
	);
}
