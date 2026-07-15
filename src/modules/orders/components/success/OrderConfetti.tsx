"use client";

import { useEffect, useRef } from "react";

/**
 * Лёгкое одноразовое конфетти на canvas — без внешних зависимостей, чтобы не
 * тянуть библиотеку ради одного эффекта и полностью контролировать вид/палитру.
 * Частицы падают под гравитацией с затуханием и исчезают. Полностью
 * отключается при prefers-reduced-motion и по завершении снимает canvas.
 */

const COLORS = [
	"#00C853", // success
	"#008CFF", // accent
	"#00C3FF", // accent-light
	"#FF4500", // primary
	"#FFD600", // warning
	"#ECEDEE", // text-primary
];

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	rotation: number;
	vr: number;
	color: string;
	shape: "rect" | "circle";
}

export function OrderConfetti() {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const prefersReduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (prefersReduced) return;

		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let width = 0;
		let height = 0;

		const resize = () => {
			width = canvas.offsetWidth;
			height = canvas.offsetHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();

		// Два источника выброса — из верхних углов к центру.
		const count = Math.min(140, Math.round(width / 8));
		const particles: Particle[] = Array.from({ length: count }, () => {
			const fromLeft = Math.random() > 0.5;
			const originX = fromLeft ? width * 0.15 : width * 0.85;
			const angle = fromLeft
				? -Math.PI / 2 + (Math.random() * 0.7 - 0.1)
				: -Math.PI / 2 - (Math.random() * 0.7 - 0.1);
			const speed = 7 + Math.random() * 7;
			return {
				x: originX,
				y: height * 0.3 + Math.random() * 40,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				size: 5 + Math.random() * 6,
				rotation: Math.random() * Math.PI,
				vr: (Math.random() - 0.5) * 0.3,
				color: COLORS[Math.floor(Math.random() * COLORS.length)],
				shape: Math.random() > 0.35 ? "rect" : "circle",
			};
		});

		const gravity = 0.22;
		const drag = 0.992;
		const start = performance.now();
		const duration = 2600;
		let raf = 0;

		const tick = (now: number) => {
			const elapsed = now - start;
			const progress = Math.min(1, elapsed / duration);
			const fade = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

			ctx.clearRect(0, 0, width, height);

			for (const p of particles) {
				p.vx *= drag;
				p.vy = p.vy * drag + gravity;
				p.x += p.vx;
				p.y += p.vy;
				p.rotation += p.vr;

				ctx.save();
				ctx.globalAlpha = Math.max(0, fade);
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rotation);
				ctx.fillStyle = p.color;
				if (p.shape === "rect") {
					ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
				} else {
					ctx.beginPath();
					ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
			}

			if (elapsed < duration) {
				raf = requestAnimationFrame(tick);
			} else {
				ctx.clearRect(0, 0, width, height);
			}
		};

		raf = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(raf);
	}, []);

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[420px] w-full"
		/>
	);
}
