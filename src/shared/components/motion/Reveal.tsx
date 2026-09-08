"use client";

import {
	Children,
	type CSSProperties,
	type ElementType,
	Fragment,
	isValidElement,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/utils/cn";

/**
 * Появление блока при попадании в кадр.
 *
 * Компонент НЕ анимирует ничего сам — он только переключает атрибут
 * data-revealed, а всё движение описано в CSS (`[data-reveal]` в
 * app/(frontend)/home.css). Разделение принципиальное: transition остаётся на
 * композиторе браузера, React не участвует ни в одном кадре анимации, и
 * страница с полусотней появляющихся блоков стоит ровно один ре-рендер на
 * блок — на переключение флага.
 *
 * Почему не react-intersection-observer, который уже есть в проекте: он
 * рассчитан на «наблюдаю и перерисовываю по inView», то есть на ре-рендер при
 * каждом пересечении. Здесь нужен ровно один переход в true и немедленное
 * отключение наблюдателя, поэтому дешевле держать наблюдатель самому.
 *
 * Появление — украшение, а не условие показа: при выключенном JS и при
 * prefers-reduced-motion контент виден полностью (см. секцию
 * prefers-reduced-motion в home.css и <noscript> в HomeStyles).
 */

export type RevealVariant = "block" | "line" | "soft";

interface UseRevealOptions {
	delay?: number;
	/**
	 * Где проходит линия срабатывания. По умолчанию на 12% выше нижнего края
	 * окна: блок начинает проявляться, когда до него ещё есть немного места, и
	 * анимацию видно целиком, а не по факту её завершения.
	 */
	rootMargin?: string;
}

/**
 * Наблюдатель «показался один раз».
 *
 * Возвращает готовый набор пропсов, поэтому годится и для собственной
 * разметки — там, где лишняя обёртка недопустима (внутри <dl>, <tr>, между
 * grid-элементами: обёртка сломала бы раскладку родителя).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗДЕСЬ НЕТ threshold
 * ────────────────────────────────────────────────────────────────────────────
 * Скрытое состояние блока — `clip-path: inset(100%)` (см. home.css). Chromium
 * учитывает clip-path цели при расчёте пересечения, поэтому у ещё не
 * показанного блока intersectionRatio ВСЕГДА равен нулю, а isIntersecting —
 * false, как бы он ни стоял на экране. Любой порог выше нуля превращается в
 * взаимную блокировку: блок не показывается, потому что не пересекает кадр, и
 * не пересекает кадр, потому что скрыт.
 *
 * Поэтому решение принимается не по доле видимости, а по геометрии: сработало
 * ли пересечение ИЛИ верх блока уже пересёк линию срабатывания. Порог как
 * настройка отсюда убран намеренно — он не может работать и вводил бы в
 * заблуждение того, кто его выставит.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
	variant: RevealVariant = "block",
	options: UseRevealOptions = {},
) {
	const { delay = 0, rootMargin = "0px 0px -12% 0px" } = options;
	const ref = useRef<T | null>(null);
	const [revealed, setRevealed] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		if (revealed) return;

		// Блок, уже находящийся в кадре или выше него на момент монтирования
		// (переход по якорю, восстановление позиции прокрутки, короткая
		// страница), IntersectionObserver в некоторых браузерах отдаёт как
		// «не пересекается» — и он остался бы скрытым навсегда. Проверяем
		// геометрию сразу, до подписки.
		if (node.getBoundingClientRect().top < window.innerHeight) {
			setRevealed(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					// Условие срабатывания — «верх блока пересёк линию», а не
					// «блок виден на N процентов»: у скрытого блока доля видимости
					// всегда ноль (см. комментарий к хуку).
					//
					// Это заодно закрывает мгновенные прыжки прокрутки — переход по
					// якорю, «наверх», восстановление позиции браузером, резкий флик
					// на телефоне. При них элемент за один шаг переходит из «ниже
					// экрана» сразу в «выше экрана», наблюдатель срабатывает ОДИН
					// раз с isIntersecting: false, и по одному этому признаку блок
					// остался бы невидимым навсегда.
					//
					// rootBounds может быть null (кросс-доменный документ) — тогда
					// опираемся на высоту окна; здесь это то же самое.
					const line = entry.rootBounds?.bottom ?? window.innerHeight;
					if (!entry.isIntersecting && entry.boundingClientRect.top >= line) {
						continue;
					}
					setRevealed(true);
					observer.disconnect();
				}
			},
			// threshold: 0 — единственное осмысленное значение, см. выше.
			{ threshold: 0, rootMargin },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [rootMargin, revealed]);

	return {
		ref,
		revealed,
		props: {
			"data-reveal": variant,
			"data-revealed": revealed,
			style: delay
				? ({ "--reveal-delay": `${delay}ms` } as CSSProperties)
				: undefined,
		},
	};
}

interface RevealProps extends UseRevealOptions {
	children: ReactNode;
	/** Тег обёртки. По умолчанию div; для семантики можно передать span/li/p. */
	as?: ElementType;
	variant?: RevealVariant;
	className?: string;
}

export function Reveal({
	children,
	as: Tag = "div",
	variant = "block",
	className,
	...options
}: RevealProps) {
	const { ref, props } = useReveal<HTMLElement>(variant, options);

	return (
		<Tag ref={ref} className={className} {...props}>
			{children}
		</Tag>
	);
}

interface RevealGroupProps extends UseRevealOptions {
	children: ReactNode;
	/** Шаг каскада между соседями, мс. */
	stagger?: number;
	variant?: RevealVariant;
	as?: ElementType;
	childAs?: ElementType;
	childClassName?: string;
	className?: string;
}

/**
 * Каскадное появление списка: оборачивает каждого прямого потомка в Reveal со
 * сдвигом по времени.
 *
 * Шаг намеренно небольшой (по умолчанию 70 мс): при 150+ мс на десяти
 * элементах последний появляется через полторы секунды после первого, и
 * пользователь успевает начать читать раньше, чем страница закончила
 * собираться.
 */
export function RevealGroup({
	children,
	stagger = 70,
	delay = 0,
	variant = "block",
	as: Tag = "div",
	childAs,
	childClassName,
	className,
	...options
}: RevealGroupProps) {
	const items = Children.toArray(children).filter(isValidElement);

	return (
		<Tag className={className}>
			{items.map((child, index) => (
				<Reveal
					// Ключ потомка стабильнее индекса: список может
					// перерисоваться с другим порядком.
					key={child.key ?? index}
					as={childAs}
					variant={variant}
					delay={delay + index * stagger}
					className={childClassName}
					{...options}
				>
					{child}
				</Reveal>
			))}
		</Tag>
	);
}

/**
 * Построчный/пословный вход крупного заголовка: слова выезжают из-под линии
 * каскадом.
 *
 * Доступность и SEO: текст лежит в DOM РОВНО ОДИН РАЗ — обычными текстовыми
 * узлами внутри заголовка, просто разложенными по span-ам. Скринридер читает
 * содержимое заголовка подряд (инлайновые обёртки пауз не создают), робот
 * видит обычный заголовок.
 *
 * Ни aria-label, ни скрытого дубля здесь нет намеренно. aria-label на span без
 * роли игнорируется, а дубль в sr-only давал бы две копии одной фразы в
 * разметке — лишний текст для поиска и двойное чтение при некоторых настройках
 * скринридера.
 *
 * Пробелы вынесены ЗА пределы анимируемых обёрток: пробел в конце inline-block
 * схлопывается, и слова слиплись бы.
 */
export function RevealWords({
	text,
	className,
	stagger = 55,
	delay = 0,
	as: Tag = "span",
}: {
	text: string;
	className?: string;
	stagger?: number;
	delay?: number;
	as?: ElementType;
}) {
	const words = text.split(" ").filter(Boolean);

	return (
		<Tag className={className}>
			{words.map((word, index) => (
				<Fragment key={`${word}-${index}`}>
					<Reveal
						as="span"
						variant="line"
						delay={delay + index * stagger}
						className="inline-block"
					>
						{word}
					</Reveal>
					{index < words.length - 1 ? " " : null}
				</Fragment>
			))}
		</Tag>
	);
}

/**
 * То же для набора строк: каждая строка — свой блок, каскад идёт по строкам,
 * а не по словам. Для многострочных заголовков это читается спокойнее:
 * пословный каскад на трёх строках превращается в рябь.
 */
export function RevealLines({
	lines,
	className,
	lineClassName,
	stagger = 110,
	delay = 0,
}: {
	lines: string[];
	className?: string;
	lineClassName?: string;
	stagger?: number;
	delay?: number;
}) {
	return (
		<span className={className}>
			{lines.map((line, index) => (
				<Reveal
					key={`${line}-${index}`}
					as="span"
					variant="line"
					delay={delay + index * stagger}
					className={cn("block", lineClassName)}
				>
					{line}
				</Reveal>
			))}
		</span>
	);
}
