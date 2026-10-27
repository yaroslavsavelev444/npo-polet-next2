"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ContactForm } from "@/modules/contact/components/ContactForm";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import { printPage as copy } from "../content/print-service-content";
import type { PrintEngine } from "../scene/engine";
import s from "./PrintServiceExperience.module.css";

const REQUEST_ID = "request";
const TOTAL = String(copy.chapters.length + 2).padStart(2, "0");

/**
 * Страница 3D-печати: пролёт камеры по цеху и заявка.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КАК УСТРОЕНО
 * ────────────────────────────────────────────────────────────────────────────
 * 3D-сцена — липкий фон высотой в экран (margin-bottom: −100lvh), поверх него
 * в обычном потоке идут главы: первый экран, четыре карточки, заявка. Текст
 * прокручивается сам — никаких перехватов прокрутки, — а камера следует за
 * ним: номер главы s считается из того, какая глава сейчас в центре окна
 * (главы бывают разной высоты, поэтому опорные точки меряются, а не
 * вычисляются из долей страницы).
 *
 * three.js грузится отдельным чанком сразу после гидратации — сцена и есть
 * первый экран. Пока чанк едет, виден тёмный фон в цветах сцены; без WebGL
 * или при включённой экономии трафика вместо сцены — фото цеха.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ФОРМА
 * ────────────────────────────────────────────────────────────────────────────
 * Последняя глава — та же форма, что была на главной (ContactForm с
 * topic="print3d"): тот же server action, путь до админки и письмо
 * администраторам. Камера к этому моменту отъезжает на общий план и
 * сдвигает принтеры влево — форма встаёт в освободившуюся часть кадра.
 *
 * Сцена декоративна (aria-hidden): всё, что она «говорит», есть в тексте глав.
 */
export function PrintServiceExperience() {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const engineRef = useRef<PrintEngine | null>(null);
	const shotRef = useRef(0);
	const [engineState, setEngineState] = useState<
		"loading" | "ready" | "failed"
	>("loading");

	/* ---- Прокрутка → номер главы ----------------------------------------- */
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		let anchors: number[] = [];
		let frame = 0;

		// Опорная точка главы — положение прокрутки, при котором её центр
		// совпадает с центром окна. Первая глава — с самого верха, последняя
		// не дальше конца страницы.
		const measure = () => {
			const chapters = root.querySelectorAll<HTMLElement>("[data-chapter]");
			const viewport = window.innerHeight;
			const max = document.documentElement.scrollHeight - viewport;
			let previous = 0;
			anchors = Array.from(chapters, (chapter, index) => {
				if (index === 0) return 0;
				const rect = chapter.getBoundingClientRect();
				const center = rect.top + window.scrollY + rect.height / 2;
				const anchor = Math.min(max, center - viewport / 2);
				previous = Math.max(previous + 1, anchor);
				return previous;
			});
			update();
		};

		const update = () => {
			frame = 0;
			const y = window.scrollY;
			let shot = 0;
			for (let i = 0; i < anchors.length - 1; i += 1) {
				if (y >= anchors[i + 1]) {
					shot = i + 1;
					continue;
				}
				if (y > anchors[i])
					shot = i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
				break;
			}
			shotRef.current = shot;
			engineRef.current?.setShot(shot);
		};

		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", measure);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", measure);
		};
	}, []);

	/* ---- Движок ------------------------------------------------------------ */
	useEffect(() => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		if (!stage || !canvas) return;
		let cancelled = false;
		let engine: PrintEngine | null = null;

		const connection = (
			navigator as Navigator & { connection?: { saveData?: boolean } }
		).connection;
		if (connection?.saveData) {
			setEngineState("failed");
			return;
		}
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		import("../scene/engine")
			.then(({ createPrintEngine }) => {
				if (cancelled) return;
				engine = createPrintEngine({ canvas, root: stage, reducedMotion });
				if (!engine) {
					setEngineState("failed");
					return;
				}
				engineRef.current = engine;
				engine.setShot(shotRef.current, true);
				setEngineState("ready");
			})
			.catch((error: unknown) => {
				// Без WebGL или при сбое сцены страница остаётся целой: текст и
				// форма работают, вместо сцены — фото цеха.
				console.error("[PrintServiceExperience]", error);
				setEngineState("failed");
			});

		return () => {
			cancelled = true;
			engine?.destroy();
			engineRef.current = null;
		};
	}, []);

	return (
		<div ref={rootRef} className={cn("scheme-dark", s.root)}>
			<div
				ref={stageRef}
				className={s.stage}
				data-engine={engineState}
				aria-hidden="true"
			>
				<canvas ref={canvasRef} className={s.canvas} />
				{engineState === "failed" ? (
					<Image
						src="/images/print-service/workshop.webp"
						alt=""
						fill
						sizes="100vw"
						quality={75}
						className={s.photo}
					/>
				) : null}
				<div className={s.shade} />
			</div>

			<div className={s.flow}>
				{/* ── Первый экран ─────────────────────────────────────────── */}
				<section data-chapter className={s.hero}>
					<div className={s.heroInner}>
						<p className={cn("u-mono", s.eyebrow)}>{copy.hero.eyebrow}</p>
						<h1 className={cn("u-display", s.title)}>{copy.hero.title}</h1>
						<p className={s.lead}>{copy.hero.lead}</p>
						<p className={s.status}>
							<span className={s.statusDot} aria-hidden="true" />
							{copy.hero.status}
						</p>
						<div className={s.actions}>
							<a href={`#${REQUEST_ID}`} className={s.cta}>
								{copy.hero.cta}
								<ArrowRight className={s.ctaIcon} aria-hidden="true" />
							</a>
							<span className={cn("u-mono", s.scrollHint)}>
								<ArrowDown className={s.scrollIcon} aria-hidden="true" />
								{copy.hero.scroll}
							</span>
						</div>
					</div>
				</section>

				{/* ── Главы ────────────────────────────────────────────────── */}
				{copy.chapters.map((chapter, index) => (
					<section
						key={chapter.title}
						data-chapter
						data-side={chapter.side}
						className={s.chapter}
					>
						<Reveal variant="soft" className={s.card}>
							<p className={cn("u-mono", s.index)}>
								{String(index + 2).padStart(2, "0")} / {TOTAL}
							</p>
							<h2 className={s.cardTitle}>{chapter.title}</h2>
							<p className={s.cardText}>{chapter.text}</p>
						</Reveal>
					</section>
				))}

				{/* ── Заявка ───────────────────────────────────────────────── */}
				<section
					id={REQUEST_ID}
					data-chapter
					className={s.request}
					aria-labelledby={`${REQUEST_ID}-title`}
				>
					<div className={s.formCard}>
						<div className={s.formIntro}>
							<p className={cn("u-mono", s.index)}>
								{TOTAL} / {TOTAL} · {copy.form.eyebrow}
							</p>
							<h2 id={`${REQUEST_ID}-title`} className={s.cardTitle}>
								{copy.form.title}
							</h2>
							<p className={s.cardText}>{copy.form.lead}</p>
							<div className={s.checklist}>
								<p className={cn("u-mono", s.checklistTitle)}>
									{copy.form.checklistTitle}
								</p>
								<ul className={s.checklistList}>
									{copy.form.checklist.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						</div>
						<div className={s.form}>
							<ContactForm topic="print3d" />
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
