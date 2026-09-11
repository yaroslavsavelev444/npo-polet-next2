"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/shared/components/motion/Reveal";
import styles from "./Footer.module.css";

/**
 * Наблюдатель появления подвала — один на весь блок.
 *
 * Почему не <Reveal> вокруг каждой части: подвал рендерится в корневом макете,
 * то есть присутствует на КАЖДОЙ странице сайта. Семь отдельных
 * IntersectionObserver'ов означали бы семь клиентских компонентов в каждом
 * маршруте ради украшения. Здесь наблюдатель один, он переключает атрибут
 * data-shown на общей обёртке, а каскад по блокам делает CSS через порядковый
 * номер --i (см. .item в Footer.module.css).
 *
 * Берётся именно хук, а не готовый компонент Reveal: его набор пропсов вешает
 * data-reveal, к которому привязан общий для сайта вход через clip-path
 * (home.css). Подвалу он не подходит — в показанном состоянии от него
 * остаётся inset(0), и подсветка строки канала, выходящая за границы блока,
 * оказалась бы срезана.
 *
 * Содержимое приходит пропсом children и остаётся серверным: клиентским здесь
 * становится только обёртка с наблюдателем.
 */
export function FooterReveal({ children }: { children: ReactNode }) {
	const { ref, revealed } = useReveal<HTMLDivElement>("block");

	return (
		<div ref={ref} data-shown={revealed} className={styles.inner}>
			{children}
		</div>
	);
}
