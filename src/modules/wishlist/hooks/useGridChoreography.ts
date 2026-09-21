"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { WishlistItemView } from "../types";

/**
 * Хореография сетки избранного: уход удалённой карточки и перестроение
 * оставшихся.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ЭТО ВООБЩЕ НУЖНО
 * ────────────────────────────────────────────────────────────────────────────
 * Товар убирают из избранного сердечком на самой карточке — той же кнопкой,
 * что и везде на сайте. Стор обновляется мгновенно, и без этого хука карточка
 * просто ИСЧЕЗАЛА, а весь хвост сетки скачком переезжал на её место. На сетке
 * из десяти позиций это читается как сбой: пропало что-то, но что именно и
 * куда уехало остальное — непонятно.
 *
 * Здесь удаление получает два такта: карточка гаснет на месте, и только потом
 * соседи доезжают на новые места. Взгляд успевает связать «нажал сердечко» с
 * «вот эта позиция ушла».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЧЕРЕЗ DOM, А НЕ ЧЕРЕЗ ПРОПСЫ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Карточка и сетка — готовые компоненты, и ради анимации на одной странице их
 * трогать нельзя: `data-leaving` на карточке пришлось бы протащить через
 * ProductGrid во все места, где он используется. Поэтому хук работает с уже
 * отрисованными узлами: ищет их по семантическому тегу <article> внутри своей
 * обёртки и анимирует средствами Web Animations.
 *
 * Связь «узел ↔ позиция» — по ПОРЯДКУ: сетка рисует карточки ровно в том
 * порядке, в каком приходит массив. Если структура сетки когда-нибудь
 * изменится и узлы не найдутся, хук молча отдаст список без анимации —
 * страница продолжит работать, потеряв только украшение.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИМЕННО ДЕЛАЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *   1. уход: узлы удаляемых позиций гаснут и слегка ужимаются (190 мс);
 *   2. пауза: список остаётся прежним, пока идёт уход;
 *   3. перестроение: после смены списка выжившие узлы доезжают из старых
 *      координат в новые приёмом FLIP — сначала их сдвигают трансформацией
 *      туда, где они были, и отпускают. Браузер считает это на композиторе,
 *      раскладка не пересчитывается ни разу.
 *
 * Тот же приём обслуживает и смену порядка сортировки: карточки не
 * перепрыгивают, а переезжают.
 *
 * При prefers-reduced-motion оба такта выключены целиком — список меняется
 * мгновенно, содержание от этого не страдает.
 */

/** Сколько гаснет уходящая карточка. */
const EXIT_MS = 190;
/** Сколько едут выжившие на новые места. */
const REFLOW_MS = 360;
/** Задержка между уходами при массовой очистке — волна, а не мигание. */
const STAGGER_MS = 24;
const MAX_STAGGER_MS = 240;

const EASE_OUT_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function idsOf(items: WishlistItemView[]): string[] {
	return items.map((item) => item.product.id);
}

function sameOrder(a: WishlistItemView[], b: WishlistItemView[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i].product.id !== b[i].product.id) return false;
	}
	return true;
}

export interface GridChoreography {
	/** Ставится на обёртку вокруг сетки — внутри неё ищутся узлы карточек. */
	gridRef: React.RefObject<HTMLDivElement | null>;
	/** Список, который нужно отрисовать прямо сейчас. */
	rendered: WishlistItemView[];
}

export function useGridChoreography(
	target: WishlistItemView[],
): GridChoreography {
	const gridRef = useRef<HTMLDivElement | null>(null);
	const [rendered, setRendered] = useState<WishlistItemView[]>(target);

	// Последняя цель — для отложенного применения: к моменту, когда уход
	// доиграет, цель может успеть поменяться ещё раз (убрали вторую позицию,
	// не дождавшись первой).
	const targetRef = useRef(target);
	targetRef.current = target;

	const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Анимации ухода по идентификатору позиции: их нужно уметь отменить, если
	// позиция вернулась (сервер отказал, и стор откатился) — иначе карточка
	// осталась бы прозрачной насовсем, ведь fill: forwards переживает
	// повторную отрисовку того же узла.
	const exitsRef = useRef(new Map<string, Animation>());
	// Координаты карточек на предыдущей отрисовке — «First» приёма FLIP.
	const boxesRef = useRef(new Map<string, DOMRect>());

	const cardNodes = useCallback((): HTMLElement[] => {
		const grid = gridRef.current;
		if (!grid) return [];
		return Array.from(grid.querySelectorAll<HTMLElement>("article"));
	}, []);

	useEffect(() => {
		if (sameOrder(rendered, target)) return;

		// Вернувшиеся позиции: снимаем с них незавершённый уход.
		for (const id of idsOf(target)) {
			const animation = exitsRef.current.get(id);
			if (!animation) continue;
			animation.cancel();
			exitsRef.current.delete(id);
		}

		const targetIds = new Set(idsOf(target));
		const leavingIndexes: number[] = [];
		rendered.forEach((item, index) => {
			if (!targetIds.has(item.product.id)) leavingIndexes.push(index);
		});

		if (leavingIndexes.length === 0 || prefersReducedMotion()) {
			setRendered(target);
			return;
		}

		const nodes = cardNodes();
		if (nodes.length !== rendered.length) {
			// Узлы не совпали с моделью — анимировать нечего, показываем результат.
			setRendered(target);
			return;
		}

		leavingIndexes.forEach((index, order) => {
			const node = nodes[index];
			if (!node) return;
			const animation = node.animate(
				[
					{ opacity: 1, transform: "none" },
					{ opacity: 0, transform: "scale(0.94)" },
				],
				{
					duration: EXIT_MS,
					delay: Math.min(order * STAGGER_MS, MAX_STAGGER_MS),
					easing: EASE_IN,
					fill: "forwards",
				},
			);
			// Уходящая карточка перестаёт принимать нажатия сразу: полсекунды
			// призрака, который ещё можно нажать, — источник случайных действий.
			node.style.pointerEvents = "none";
			exitsRef.current.set(rendered[index].product.id, animation);
		});

		if (flushRef.current) return;

		const wait =
			EXIT_MS +
			Math.min((leavingIndexes.length - 1) * STAGGER_MS, MAX_STAGGER_MS);

		flushRef.current = setTimeout(() => {
			flushRef.current = null;
			exitsRef.current.clear();
			setRendered(targetRef.current);
		}, wait);
	}, [target, rendered, cardNodes]);

	useEffect(
		() => () => {
			if (flushRef.current) clearTimeout(flushRef.current);
		},
		[],
	);

	// FLIP. Замер «до» — координаты, записанные после ПРЕДЫДУЩЕЙ отрисовки;
	// замер «после» — текущие. Разницу гасим трансформацией и отпускаем.
	useLayoutEffect(() => {
		const nodes = cardNodes();
		const previous = boxesRef.current;
		const current = new Map<string, DOMRect>();

		rendered.forEach((item, index) => {
			const node = nodes[index];
			if (node) current.set(item.product.id, node.getBoundingClientRect());
		});

		if (previous.size > 0 && !prefersReducedMotion()) {
			rendered.forEach((item, index) => {
				const node = nodes[index];
				const before = previous.get(item.product.id);
				const after = current.get(item.product.id);
				if (!node || !before || !after) return;

				const dx = before.left - after.left;
				const dy = before.top - after.top;
				// Меньше половины пикселя — это не переезд, а округление.
				if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

				node.animate(
					[
						{ transform: `translate3d(${dx}px, ${dy}px, 0)` },
						{ transform: "translate3d(0, 0, 0)" },
					],
					{ duration: REFLOW_MS, easing: EASE_OUT_EXPO },
				);
			});
		}

		boxesRef.current = current;
	}, [rendered, cardNodes]);

	return { gridRef, rendered };
}
