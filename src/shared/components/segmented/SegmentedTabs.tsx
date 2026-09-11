"use client";

import type { ReactNode } from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import styles from "./SegmentedTabs.module.css";

export interface SegmentedTabItem<K extends string> {
	key: K;
	label: string;
	/** Значок слева от подписи. Не обязателен. */
	icon?: ReactNode;
	/** Число рядом с подписью — сколько всего в этой позиции. */
	count?: number;
}

interface SegmentedTabsProps<K extends string> {
	items: SegmentedTabItem<K>[];
	value: K;
	onChange: (key: K) => void;
	/** Имя группы для скринридера. */
	label: string;
	/**
	 * Префикс id панели, которой управляет сегмент: сегмент получает
	 * `${idPrefix}-tab-${key}`, а панель ожидается под
	 * `${idPrefix}-panel-${key}`. Без него связь tab → tabpanel не объявляется.
	 */
	idPrefix?: string;
	/**
	 * Переключение идёт через сервер и может занять время: помечает ряд как
	 * занятый и приглушает его, не запрещая нажатия.
	 */
	pending?: boolean;
}

/**
 * Сегментированный переключатель с переезжающей подсветкой.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ГЕОМЕТРИЯ В CSS-ПЕРЕМЕННЫХ, А НЕ В СОСТОЯНИИ
 * ────────────────────────────────────────────────────────────────────────────
 * Подсветка едет между сегментами трансформацией: значения пишутся в --nav-x
 * и --nav-w прямо на элементе ряда, переезд считает браузер, ре-рендера ни
 * одного. Через useState это был бы ре-рендер всего ряда на каждое нажатие
 * ради двух чисел, которые React всё равно не использует.
 *
 * Замеряется offsetLeft относительно САМОГО РЯДА, а не окна: на узком экране
 * ряд прокручивается, и от координат окна подсветка уезжала бы вбок при
 * каждой прокрутке.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КЛАВИАТУРА
 * ────────────────────────────────────────────────────────────────────────────
 * Стандартное поведение вкладок: в обход табом входит ОДИН сегмент —
 * выбранный, — а между сегментами ходят стрелками (roving tabindex). Переход
 * стрелкой сразу переключает позицию: панели мгновенные, и требовать
 * подтверждения пробелом значило бы добавить нажатие без причины.
 */
export function SegmentedTabs<K extends string>({
	items,
	value,
	onChange,
	label,
	idPrefix,
	pending = false,
}: SegmentedTabsProps<K>) {
	const listRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef(new Map<K, HTMLButtonElement>());
	const [ready, setReady] = useState(false);

	const sync = useCallback(() => {
		const list = listRef.current;
		const item = itemRefs.current.get(value);
		if (!list || !item) return;

		// clientLeft — ширина левой рамки ряда. offsetLeft считается от внешнего
		// края рамки, а left у абсолютного потомка — от внутреннего; без
		// поправки подсветка стоит на пиксель левее сегмента.
		const x = item.offsetLeft - list.clientLeft;
		list.style.setProperty("--nav-x", `${x}px`);
		list.style.setProperty("--nav-w", `${item.offsetWidth}px`);
		setReady(true);

		// Выбранный сегмент подтягивается в видимую часть ряда. Своя арифметика,
		// а не scrollIntoView: тот умеет прокрутить заодно и всю страницу, а ряд
		// обычно стоит в липкой панели и должен остаться на месте.
		const visibleStart = list.scrollLeft;
		const visibleEnd = visibleStart + list.clientWidth;
		if (x < visibleStart) {
			list.scrollLeft = Math.max(0, x - 8);
		} else if (x + item.offsetWidth > visibleEnd) {
			list.scrollLeft = x + item.offsetWidth - list.clientWidth + 8;
		}
	}, [value]);

	// useLayoutEffect, а не useEffect: замер до отрисовки кадра, иначе на
	// первом кадре подсветка стоит нулевой ширины и видно, как она
	// «раскрывается».
	useLayoutEffect(() => {
		sync();
	}, [sync]);

	// Ширина сегментов меняется от подгрузки шрифта и от поворота экрана.
	// Наблюдаем сами сегменты: ряд при этом своей ширины не меняет, и
	// наблюдатель на нём ничего бы не поймал.
	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => sync());
		for (const node of itemRefs.current.values()) observer.observe(node);
		return () => observer.disconnect();
	}, [sync]);

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const index = items.findIndex((item) => item.key === value);
		let next = index;

		switch (event.key) {
			case "ArrowLeft":
				next = (index - 1 + items.length) % items.length;
				break;
			case "ArrowRight":
				next = (index + 1) % items.length;
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = items.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		const key = items[next].key;
		onChange(key);
		// Фокус идёт за выбором: иначе следующая стрелка считалась бы от
		// сегмента, который уже не активен.
		itemRefs.current.get(key)?.focus();
	}

	return (
		<div
			ref={listRef}
			role="tablist"
			aria-label={label}
			aria-orientation="horizontal"
			aria-busy={pending || undefined}
			data-ready={ready || undefined}
			data-pending={pending || undefined}
			onKeyDown={handleKeyDown}
			className={styles.nav}
		>
			<span aria-hidden className={styles.navHighlight} />

			{items.map((item) => {
				const isActive = item.key === value;
				return (
					<button
						key={item.key}
						ref={(node) => {
							if (node) itemRefs.current.set(item.key, node);
							else itemRefs.current.delete(item.key);
						}}
						type="button"
						role="tab"
						id={idPrefix ? `${idPrefix}-tab-${item.key}` : undefined}
						aria-selected={isActive}
						aria-controls={
							idPrefix ? `${idPrefix}-panel-${item.key}` : undefined
						}
						tabIndex={isActive ? 0 : -1}
						onClick={() => onChange(item.key)}
						className={styles.navItem}
					>
						{item.icon ? (
							<span className={styles.navIcon}>{item.icon}</span>
						) : null}
						{item.label}
						{item.count !== undefined && item.count > 0 && (
							<span className={styles.navCount}>{item.count}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

export default SegmentedTabs;
