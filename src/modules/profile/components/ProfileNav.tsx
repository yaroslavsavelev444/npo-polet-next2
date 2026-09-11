"use client";

import { MonitorSmartphone, ShieldCheck, User } from "lucide-react";
import type { ReactNode } from "react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import type { ProfileTab } from "../types/profile.types";
import styles from "./Profile.module.css";

interface NavItem {
	key: ProfileTab;
	label: string;
	icon: ReactNode;
}

const ITEMS: NavItem[] = [
	{ key: "account", label: "Аккаунт", icon: <User size={14} aria-hidden /> },
	{
		key: "security",
		label: "Безопасность",
		icon: <ShieldCheck size={14} aria-hidden />,
	},
	{
		key: "sessions",
		label: "Устройства",
		icon: <MonitorSmartphone size={14} aria-hidden />,
	},
];

interface ProfileNavProps {
	active: ProfileTab;
	onChange: (tab: ProfileTab) => void;
	/** Число активных устройств — счётчик у своего раздела. */
	sessionCount: number;
}

/**
 * Навигация по разделам кабинета.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СЕГМЕНТЫ В ЛИПКОЙ ПАНЕЛИ, А НЕ ВКЛАДКИ С ПОДЧЁРКИВАНИЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * Панель — та же .rail, что держит управление выдачей каталога: класс тот же
 * самый, поэтому две страницы не могут разъехаться ни по росту, ни по
 * материалу, ни по поведению при прокрутке. В кабинете это не украшение:
 * список устройств бывает длиннее экрана, и переключиться на другой раздел из
 * его конца, не прокручивая обратно наверх, можно только так.
 *
 * Разделов три, они взаимоисключающие — значит сегментированный
 * переключатель, а не строка ссылок: промежуток между пунктами соврал бы, что
 * их можно выбрать несколько.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОДСВЕТКА ПЕРЕЕЗЖАЕТ, А НЕ ПЕРЕЗАЖИГАЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Один элемент, который едет от сегмента к сегменту. Заливка, гаснущая в
 * одном месте и загорающаяся в другом, читается как два несвязанных события;
 * переезд показывает, что это одна позиция в одном ряду, — то же, что делает
 * прочерк акцента под активной строкой в остальной системе.
 *
 * Геометрия пишется в CSS-переменные (--nav-x, --nav-w), а не в состояние
 * React: переезд считает браузер на композиторе, ре-рендера ни одного.
 * Замеряется offsetLeft относительно самой панели, а НЕ окна: ряд на узком
 * экране прокручивается, и от координат окна подсветка уезжала бы вбок при
 * каждой прокрутке.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КЛАВИАТУРА
 * ────────────────────────────────────────────────────────────────────────────
 * Стандартное поведение вкладок: в обход табом входит ОДИН сегмент —
 * выбранный, — а между сегментами ходят стрелками (roving tabindex). Переход
 * стрелкой сразу переключает раздел: панелей три, они мгновенные, и требовать
 * подтверждения пробелом значило бы добавить нажатие без причины.
 */
export function ProfileNav({
	active,
	onChange,
	sessionCount,
}: ProfileNavProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef(new Map<ProfileTab, HTMLButtonElement>());
	const [ready, setReady] = useState(false);

	const sync = useCallback(() => {
		const list = listRef.current;
		const item = itemRefs.current.get(active);
		if (!list || !item) return;

		// clientLeft — ширина левой рамки панели. offsetLeft считается от
		// внешнего края рамки, а left у абсолютного потомка — от внутреннего;
		// без поправки подсветка стоит на пиксель левее сегмента.
		const x = item.offsetLeft - list.clientLeft;
		list.style.setProperty("--nav-x", `${x}px`);
		list.style.setProperty("--nav-w", `${item.offsetWidth}px`);
		setReady(true);

		// Выбранный сегмент подтягивается в видимую часть ряда. Своя
		// арифметика, а не scrollIntoView: тот умеет прокрутить заодно и всю
		// страницу, а панель липкая и должна остаться на месте.
		const visibleStart = list.scrollLeft;
		const visibleEnd = visibleStart + list.clientWidth;
		if (x < visibleStart) {
			list.scrollLeft = Math.max(0, x - 8);
		} else if (x + item.offsetWidth > visibleEnd) {
			list.scrollLeft = x + item.offsetWidth - list.clientWidth + 8;
		}
	}, [active]);

	// useLayoutEffect, а не useEffect: замер до отрисовки кадра, иначе на
	// первом кадре подсветка стоит нулевой ширины и видно, как она
	// «раскрывается».
	useLayoutEffect(() => {
		sync();
	}, [sync]);

	// Ширина сегментов меняется от подгрузки шрифта и от поворота экрана.
	// Наблюдаем сами сегменты: панель при этом своей ширины не меняет, и
	// наблюдатель на ней ничего бы не поймал.
	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => sync());
		for (const node of itemRefs.current.values()) observer.observe(node);
		return () => observer.disconnect();
	}, [sync]);

	function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		const index = ITEMS.findIndex((item) => item.key === active);
		let next = index;

		switch (event.key) {
			case "ArrowLeft":
				next = (index - 1 + ITEMS.length) % ITEMS.length;
				break;
			case "ArrowRight":
				next = (index + 1) % ITEMS.length;
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = ITEMS.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		const key = ITEMS[next].key;
		onChange(key);
		// Фокус идёт за выбором: иначе следующая стрелка считалась бы от
		// сегмента, который уже не активен.
		itemRefs.current.get(key)?.focus();
	}

	return (
		<div className={catalog.rail}>
			<div className={catalog.railRow}>
				<div
					ref={listRef}
					role="tablist"
					aria-label="Разделы кабинета"
					aria-orientation="horizontal"
					data-ready={ready || undefined}
					onKeyDown={handleKeyDown}
					className={styles.nav}
				>
					<span aria-hidden className={styles.navHighlight} />

					{ITEMS.map((item) => {
						const isActive = item.key === active;
						return (
							<button
								key={item.key}
								ref={(node) => {
									if (node) itemRefs.current.set(item.key, node);
									else itemRefs.current.delete(item.key);
								}}
								type="button"
								role="tab"
								id={`profile-tab-${item.key}`}
								aria-selected={isActive}
								aria-controls={`profile-panel-${item.key}`}
								tabIndex={isActive ? 0 : -1}
								onClick={() => onChange(item.key)}
								className={styles.navItem}
							>
								<span className={styles.navIcon}>{item.icon}</span>
								{item.label}
								{item.key === "sessions" && sessionCount > 0 && (
									<span className={styles.navCount}>{sessionCount}</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export default ProfileNav;
