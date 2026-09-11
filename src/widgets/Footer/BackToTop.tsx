"use client";

import { ArrowUp } from "lucide-react";
import type { MouseEvent } from "react";
import styles from "./Footer.module.css";

/**
 * Возврат к началу страницы.
 *
 * Остаётся ССЫЛКОЙ на #top, а не кнопкой. «top» — предусмотренная стандартом
 * цель: если элемента с таким идентификатором в документе нет, браузер сам
 * уводит к началу. Значит, при отключённом или ещё не загруженном JavaScript
 * действие работает, а обработчик ниже только улучшает его.
 *
 * Что добавляет обработчик:
 *  • плавность вместо мгновенного прыжка — и сразу же её отмену, если
 *    пользователь просил меньше движения (длинная страница при
 *    prefers-reduced-motion прокручивалась бы несколько секунд);
 *  • отказ от записи «#top» в историю: начало страницы — не место, куда
 *    захочется вернуться кнопкой «назад»;
 *  • перевод фокуса в шапку. Без него клавиатурный пользователь нажимает
 *    «Наверх», страница уезжает, а следующий Tab продолжает обход с подвала —
 *    то есть с того места, которое он только что покинул. tabindex="-1"
 *    ставится на время: постоянный атрибут на шапке принадлежал бы ей, а не
 *    этой кнопке.
 */
export function BackToTop({ label = "Наверх" }: { label?: string }) {
	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		// Модификаторы и средняя кнопка — это «открыть в новой вкладке».
		// Перехватывать их нельзя.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}

		event.preventDefault();

		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });

		const header = document.querySelector<HTMLElement>("[data-sticky-header]");
		if (!header) return;

		header.setAttribute("tabindex", "-1");
		header.focus({ preventScroll: true });
		header.addEventListener("blur", () => header.removeAttribute("tabindex"), {
			once: true,
		});
	};

	return (
		<a href="#top" onClick={handleClick} className={styles.toTop}>
			<ArrowUp className={styles.toTopIcon} aria-hidden="true" />
			{label}
		</a>
	);
}
