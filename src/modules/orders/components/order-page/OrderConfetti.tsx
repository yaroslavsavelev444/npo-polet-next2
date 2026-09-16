"use client";

import { useEffect, useRef } from "react";

/**
 * Конфетти на canvas — один раз, в момент оформления заказа.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ПОЧЕМУ СВОЙ CANVAS, А НЕ БИБЛИОТЕКА
 * ════════════════════════════════════════════════════════════════════════════
 * Готовые библиотеки конфетти весят 5–15 КБ и приносят свою палитру, свою
 * физику и свой цикл отрисовки. Здесь нужно ровно одно всплытие за жизнь
 * страницы, в фирменных цветах и с управляемой плотностью — это сотня строк
 * на том же rAF, который в проекте уже крутит появление секций. Зависимость
 * ради этого не окупается ни байтами, ни контролем.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ЧТО ДЕЛАЕТ ЭФФЕКТ «ДОРОГИМ», А НЕ «ПРАЗДНИЧНЫМ»
 * ════════════════════════════════════════════════════════════════════════════
 * Четыре вещи, и ни одна не про количество частиц:
 *
 *  1. ГЛУБИНА. Частицы разложены по трём планам. Дальний — мельче, медленнее,
 *     полупрозрачнее и слегка размыт; ближний — крупнее и быстрее. Один и тот
 *     же выброс перестаёт быть плоской наклейкой и получает объём.
 *
 *  2. ТРЕПЕТАНИЕ. Прямоугольник сжимается по одной оси по косинусу
 *     собственной фазы — ровно так ведёт себя настоящая бумажная лента,
 *     поворачиваясь к зрителю то плоскостью, то ребром. Это единственная
 *     деталь, по которой глаз отличает конфетти от «летящих квадратиков»,
 *     и стоит она одного умножения на частицу.
 *
 *  3. ВОЗДУХ. Общий медленный снос плюс собственное покачивание каждой
 *     частицы. Без него все траектории параллельны и читаются как заставка
 *     из девяностых.
 *
 *  4. ВЫСТРЕЛ, А НЕ ПОЯВЛЕНИЕ. Две боковые пушки бьют внутрь к центру с
 *     разбросом по углу и силе, третья горстка — короткий пых снизу по
 *     центру, с задержкой. Одновременный старт всех частиц читается как
 *     «кадр подставили», разнесённый — как хлопок.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ЧТОБЫ ЭФФЕКТ НЕ МЕШАЛ
 * ════════════════════════════════════════════════════════════════════════════
 * Слой не перехватывает нажатия, не попадает в дерево доступности и живёт
 * ровно 3.2 секунды, после чего canvas очищается и отрисовка прекращается.
 * Он лежит ПОД содержимым первого экрана (z-index), поэтому даже в разгар
 * анимации номер заказа и кнопки читаются и нажимаются.
 *
 * prefers-reduced-motion выключает эффект целиком: ни одного кадра, ни одного
 * обработчика. Вкладка в фоне — цикл приостанавливается, чтобы не тратить
 * батарею на анимацию, которую никто не видит.
 */

/**
 * Палитра намеренно НЕ равномерная: три четверти частиц — фирменные
 * оранжевый и зелёный успеха, остальное — редкие голубые и белые искры.
 * Шесть цветов в равных долях дают «клоунский» ковёр; взвешенная палитра
 * читается как фирменная.
 */
const PALETTE = [
	{ color: "#FF4500", weight: 4 }, // primary
	{ color: "#00C853", weight: 4 }, // success
	{ color: "#FF8040", weight: 2 }, // primary-300
	{ color: "#00C3FF", weight: 1 }, // accent-light
	{ color: "#FFD600", weight: 1 }, // warning
	{ color: "#ECEDEE", weight: 1 }, // text-primary
];

const WEIGHTED_COLORS: string[] = PALETTE.flatMap((entry) =>
	Array.from({ length: entry.weight }, () => entry.color),
);

type Shape = "ribbon" | "disc" | "streamer";

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Полуширина ленты. */
	size: number;
	rotation: number;
	vr: number;
	/** Фаза трепетания и её скорость — лента поворачивается к зрителю. */
	flutter: number;
	vf: number;
	/** Собственное покачивание в потоке воздуха. */
	swayPhase: number;
	swaySpeed: number;
	swayAmount: number;
	color: string;
	shape: Shape;
	/** План: 0 — дальний, 1 — ближний. Задаёт масштаб, скорость и прозрачность. */
	depth: number;
	/** Задержка вылета, кадры. Разносит выстрел во времени. */
	delay: number;
}

const DURATION = 3200;
const GRAVITY = 0.16;
const DRAG = 0.986;
/** Снос вправо: слабый, чтобы облако не уезжало с экрана целиком. */
const WIND = 0.012;

function pick<T>(items: T[]): T {
	return items[Math.floor(Math.random() * items.length)];
}

function createParticle(
	width: number,
	height: number,
	index: number,
): Particle {
	// Три источника: левая пушка, правая пушка и короткий пых снизу.
	const source = index % 5;
	const fromCenter = source === 4;
	const fromLeft = source < 2;

	const depth = Math.random();
	// Ближний план быстрее и крупнее — это и создаёт параллакс.
	const scale = 0.55 + depth * 0.75;

	let originX: number;
	let originY: number;
	let angle: number;
	let speed: number;

	if (fromCenter) {
		originX = width * (0.42 + Math.random() * 0.16);
		originY = height * 0.62;
		angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
		speed = (5 + Math.random() * 5) * scale;
	} else {
		originX = fromLeft ? width * 0.08 : width * 0.92;
		originY = height * (0.34 + Math.random() * 0.18);
		// Пушки бьют вверх и ВНУТРЬ: наружу конфетти улетело бы за кадр,
		// не показавшись.
		const inward = fromLeft ? 1 : -1;
		angle = -Math.PI / 2 + inward * (0.35 + Math.random() * 0.55);
		speed = (8 + Math.random() * 7) * scale;
	}

	return {
		x: originX,
		y: originY,
		vx: Math.cos(angle) * speed,
		vy: Math.sin(angle) * speed,
		size: (3.5 + Math.random() * 4) * scale,
		rotation: Math.random() * Math.PI * 2,
		vr: (Math.random() - 0.5) * 0.24,
		flutter: Math.random() * Math.PI * 2,
		vf: 0.1 + Math.random() * 0.16,
		swayPhase: Math.random() * Math.PI * 2,
		swaySpeed: 0.018 + Math.random() * 0.03,
		swayAmount: (0.25 + Math.random() * 0.5) * scale,
		color: pick(WEIGHTED_COLORS),
		shape:
			Math.random() < 0.62
				? "ribbon"
				: Math.random() < 0.6
					? "disc"
					: "streamer",
		depth,
		// Пых снизу отстаёт от боковых пушек — так хлопок читается объёмным.
		delay: fromCenter ? 8 + Math.random() * 10 : Math.random() * 6,
	};
}

export function OrderConfetti() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Плотность привязана к ширине, но с потолком: на широком мониторе
		// эффект не должен превращаться в снегопад, а на телефоне — в три
		// одиноких квадратика.
		const width = canvas.offsetWidth;
		const height = canvas.offsetHeight;
		if (width === 0 || height === 0) return;

		// Ретина: рисуем в физических пикселях, но считаем в логических.
		// Ограничение 2 — выше разница не видна, а площадь растёт квадратично.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const count = Math.round(Math.min(190, Math.max(70, width / 6)));
		const particles = Array.from({ length: count }, (_, index) =>
			createParticle(width, height, index),
		);

		let raf = 0;
		// Отсчёт начинается с ПЕРВОГО нарисованного кадра, а не с монтирования.
		// Разница существенна, когда вкладку открыли в фоне: requestAnimationFrame
		// там не вызывается вовсе, и при отсчёте от монтирования эффект к моменту
		// возвращения пользователя оказался бы уже «отыгранным» — то есть
		// пропал бы целиком, хотя отметка о празднике уже потрачена.
		let startedAt: number | null = null;
		// Уход во вкладку-невидимку посреди эффекта: время не должно утекать,
		// пока анимацию никто не видит.
		let pausedAt: number | null = null;

		const handleVisibility = () => {
			if (document.visibilityState === "hidden") {
				pausedAt = performance.now();
				cancelAnimationFrame(raf);
				return;
			}
			if (pausedAt !== null) {
				if (startedAt !== null) startedAt += performance.now() - pausedAt;
				pausedAt = null;
				raf = requestAnimationFrame(tick);
			}
		};

		function draw(p: Particle, alpha: number) {
			if (!ctx) return;
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.fillStyle = p.color;

			if (p.shape === "disc") {
				// Диск тоже трепещет — сжимается в эллипс и обратно.
				ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flutter))));
				ctx.beginPath();
				ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
				ctx.fill();
			} else {
				const flutterScale = Math.cos(p.flutter);
				const w = p.size * 2;
				const h =
					p.shape === "streamer" ? p.size * 0.32 : p.size * 0.85 * flutterScale;
				// Лента, повёрнутая ребром, имеет нулевую высоту — рисовать
				// нечего, и браузер на этом кадре ничего не делает.
				if (Math.abs(h) < 0.35) {
					ctx.restore();
					return;
				}
				ctx.scale(1, p.shape === "streamer" ? flutterScale : 1);
				ctx.fillRect(-w / 2, -Math.abs(h) / 2, w, Math.abs(h));
			}

			ctx.restore();
		}

		function tick(now: number) {
			if (!ctx) return;
			if (startedAt === null) startedAt = now;
			const elapsed = now - startedAt;
			const progress = Math.min(1, elapsed / DURATION);
			// Общее затухание начинается в последней трети: раньше эффект
			// выглядел бы оборванным, позже — исчезающим рывком.
			const globalFade = progress > 0.62 ? 1 - (progress - 0.62) / 0.38 : 1;

			ctx.clearRect(0, 0, width, height);

			for (const p of particles) {
				if (p.delay > 0) {
					p.delay -= 1;
					continue;
				}

				p.swayPhase += p.swaySpeed;
				p.flutter += p.vf;
				p.rotation += p.vr;

				// Ближний план тяжелее: у него больше и скорость, и падение.
				const weight = 0.7 + p.depth * 0.6;
				p.vx =
					p.vx * DRAG +
					WIND * weight +
					Math.cos(p.swayPhase) * p.swayAmount * 0.12;
				p.vy = p.vy * DRAG + GRAVITY * weight;
				p.x += p.vx + Math.cos(p.swayPhase) * p.swayAmount;
				p.y += p.vy;

				// Дальний план бледнее — воздушная перспектива.
				const depthAlpha = 0.45 + p.depth * 0.55;
				// Частица, вылетевшая за нижний край, гаснет заранее, а не
				// обрезается краем canvas.
				const exitFade =
					p.y > height * 0.86
						? Math.max(0, 1 - (p.y - height * 0.86) / (height * 0.2))
						: 1;

				const alpha = globalFade * depthAlpha * exitFade;
				if (alpha <= 0.01) continue;
				draw(p, alpha);
			}

			if (elapsed < DURATION) {
				raf = requestAnimationFrame(tick);
			} else {
				ctx.clearRect(0, 0, width, height);
			}
		}

		document.addEventListener("visibilitychange", handleVisibility);
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			// Слой лежит ПОД содержимым и не ловит нажатия: во время эффекта
			// страницей можно пользоваться.
			className="pointer-events-none absolute inset-x-0 top-0 h-[min(34rem,100%)] w-full"
		/>
	);
}
