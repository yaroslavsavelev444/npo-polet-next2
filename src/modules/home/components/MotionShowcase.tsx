"use client";

import { ArrowRight } from "lucide-react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useScrollProgress } from "@/shared/components/motion/useScrollProgress";
import { cn } from "@/utils/cn";
import { principle } from "../content/home-content";
import {
	resolveValue,
	type ShowcaseProductId,
	showcaseProducts,
} from "../content/showcase-content";
import type { ShowcaseEngine } from "../showcase/engine";
import s from "./MotionShowcase.module.css";

/**
 * Моушн-витрина «Как это работает» — по ролику на каждое изделие.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КАК УСТРОЕНО
 * ────────────────────────────────────────────────────────────────────────────
 * Высокий «трек» и липкая сцена на весь экран внутри него. Пока трек
 * проезжает, сцена стоит, а доля пройденного пути (useScrollProgress,
 * режим sticky) — это позиция в ролике. Прокрутка назад отматывает ролик.
 *
 * Длина трека пропорциональна длине ролика: SCROLL_VH_PER_SECOND экранных
 * процентов на секунду. Ролик в 26 с — около шести экранов прокрутки.
 *
 * 3D рисует движок на three.js (src/modules/home/showcase). Он грузится
 * отдельным чанком, когда блок подходит к экрану на полтора экрана, —
 * three.js не попадает в первую загрузку главной.
 *
 * Меню наверху переключает изделие: сцена сменяется, страница прыгает в
 * начало трека (сцена при этом стоит на месте — она липкая), и ролик
 * нового изделия начинается с первого кадра. Досмотрели — меню и кнопка
 * внизу предлагают следующее изделие.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУПНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Всё, что показывает ролик, продублировано текстом в скрытом от глаз
 * блоке: шаги и характеристики всех изделий доступны скринридеру и
 * поисковику без WebGL и без прокрутки. Сам кадр — aria-hidden.
 */

const SCROLL_VH_PER_SECOND = 24;

interface MotionShowcaseProps {
	/**
	 * Показать один ролик — на странице товара. Меню и предложение
	 * «следующего изделия» в этом режиме нет: посетитель пришёл за этим
	 * товаром, и переключать его на другие было бы неуместно.
	 */
	only?: ShowcaseProductId;
	/** id секции — якорь; на главной это «principle» из указателя разделов. */
	id?: string;
}

export function MotionShowcase({
	only,
	id = "principle",
}: MotionShowcaseProps) {
	const single = Boolean(only);
	const [productId, setProductId] = useState<ShowcaseProductId>(
		only ?? showcaseProducts[0].id,
	);
	const index = showcaseProducts.findIndex((p) => p.id === productId);
	const product = showcaseProducts[index];
	const next = showcaseProducts[(index + 1) % showcaseProducts.length];

	const stageRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const engineRef = useRef<ShowcaseEngine | null>(null);
	const progressRef = useRef(0);
	const productRef = useRef(productId);
	const jumpRef = useRef(false);

	const onProgress = useCallback((p: number) => {
		progressRef.current = p;
		engineRef.current?.setProgress(p);
	}, []);
	const trackRef = useScrollProgress<HTMLDivElement>({
		mode: "sticky",
		onProgress,
	});

	/* ---- Ленивая загрузка движка ---------------------------------------- */
	useEffect(() => {
		const track = trackRef.current;
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		if (!track || !stage || !canvas) return;
		let cancelled = false;
		let engine: ShowcaseEngine | null = null;
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		const load = () => {
			import("../showcase/engine")
				.then(({ createShowcaseEngine }) => {
					if (cancelled) return;
					engine = createShowcaseEngine({
						canvas,
						root: stage,
						initialProduct: productRef.current,
						reducedMotion,
						classes: {
							label: s.label,
							labelLeft: s.labelLeft,
							labelAccent: s.labelAccent,
							labelLarge: s.labelLarge,
							labelBare: s.labelBare,
							labelDot: s.labelDot,
							labelLine: s.labelLine,
							labelBody: s.labelBody,
							labelSub: s.labelSub,
							labelText: s.labelText,
						},
					});
					stage.dataset.engine = engine ? "ready" : "failed";
					if (!engine) return;
					engineRef.current = engine;
					engine.setProgress(progressRef.current, true);
				})
				.catch((error: unknown) => {
					// Без WebGL или при сбое сцены блок остаётся текстовым (HUD и
					// меню работают), но причину видно в консоли.
					console.error("[MotionShowcase]", error);
					stage.dataset.engine = "failed";
				});
		};

		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				observer.disconnect();
				load();
			},
			{ rootMargin: "150% 0px" },
		);
		observer.observe(track);

		return () => {
			cancelled = true;
			observer.disconnect();
			engine?.destroy();
			engineRef.current = null;
		};
	}, [trackRef]);

	/* ---- Смена изделия -------------------------------------------------- */
	// useLayoutEffect: прыжок в начало трека должен случиться до отрисовки,
	// иначе на один кадр мелькнёт новый ролик с середины.
	useLayoutEffect(() => {
		productRef.current = productId;
		const engine = engineRef.current;
		engine?.setProduct(productId);
		if (!jumpRef.current) return;
		jumpRef.current = false;
		const track = trackRef.current;
		if (!track) return;
		const top = track.getBoundingClientRect().top + window.scrollY;
		window.scrollTo({ top: Math.ceil(top), behavior: "instant" });
		progressRef.current = 0;
		engine?.setProgress(0, true);
	}, [productId, trackRef]);

	// На телефоне меню — горизонтальная лента: активный пункт держим в
	// поле зрения, иначе после «Далее» выбранное изделие уезжает за край.
	const menuRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		const menu = menuRef.current;
		const active = menu?.querySelector<HTMLElement>(
			`[data-product="${productId}"]`,
		);
		if (!menu || !active || menu.scrollWidth <= menu.clientWidth) return;
		menu.scrollTo({
			left: active.offsetLeft - (menu.clientWidth - active.offsetWidth) / 2,
			behavior: "smooth",
		});
	}, [productId]);

	const select = (id: ShowcaseProductId) => {
		jumpRef.current = true;
		if (id === productId) {
			// Повторное нажатие — смотреть ролик сначала.
			const track = trackRef.current;
			if (!track) return;
			const top = track.getBoundingClientRect().top + window.scrollY;
			window.scrollTo({ top: Math.ceil(top), behavior: "instant" });
			engineRef.current?.setProgress(0, true);
			jumpRef.current = false;
			return;
		}
		setProductId(id);
	};

	const skip = () => {
		const track = trackRef.current;
		if (!track) return;
		const bottom = track.getBoundingClientRect().bottom + window.scrollY;
		window.scrollTo({ top: bottom, behavior: "smooth" });
	};

	const trackStyle = {
		height: `calc(${Math.round(product.duration * SCROLL_VH_PER_SECOND)}svh + 100svh)`,
	} satisfies CSSProperties;

	return (
		<section id={id} className={s.section} aria-labelledby={`${id}-title`}>
			<h2 id={`${id}-title`} className="sr-only">
				{single ? `Как работает ${product.name}` : principle.title}
			</h2>

			<div ref={trackRef} className={s.track} style={trackStyle}>
				<div
					ref={stageRef}
					className={cn(s.stage, single && s.stageInset, "scheme-dark")}
					data-ended="0"
					data-typing="0"
				>
					<div className={s.poster} aria-hidden="true" />
					<canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
					<div className={s.vignette} aria-hidden="true" />

					{/* Кадр: всё ниже дублирует скрытый текст в конце секции. */}
					<div className={s.hud} aria-hidden="true">
						<span className={cn(s.corner, s.cornerTl)} />
						<span className={cn(s.corner, s.cornerTr)} />
						<span className={cn(s.corner, s.cornerBl)} />
						<span className={cn(s.corner, s.cornerBr)} />

						<div className={s.head}>
							<span className={cn(s.mono, s.square, s.headKicker)}>
								Принцип работы · {product.category}
							</span>
							<span className={cn(s.display, s.headName)}>{product.name}</span>
						</div>

						<div className={cn(s.mono, s.meta)}>
							<span>НПО «Полёт»</span>
							<span className={s.timer} data-hud="timer" />
						</div>

						<div className={s.intro}>
							<span className={cn(s.mono, s.square, s.introKicker)}>
								Как это работает
							</span>
							<span className={cn(s.display, s.introName)}>{product.name}</span>
							<span className={cn(s.mono, s.hint)}>
								<span className={s.hintLine} />
								Прокручивайте — ролик идёт за прокруткой
							</span>
						</div>

						<div className={s.bottom}>
							<div className={s.step}>
								<div className={s.bars}>
									{product.steps.map((step) => (
										<span key={step.title} className={s.bar} data-hud="bar" />
									))}
								</div>
								<span
									className={cn(s.mono, s.stepIndex)}
									data-hud="step-index"
								/>
								<span
									className={cn(s.display, s.stepTitle)}
									data-hud="step-title"
								/>
								<p className={s.stepText} data-hud="step-text" />
							</div>

							{product.specs.length ? (
								<dl className={s.specs}>
									{product.specs.map((spec, i) => (
										<div
											key={spec.label}
											className={s.spec}
											style={{ "--i": i } as CSSProperties}
										>
											<dt className={cn(s.mono, s.specLabel)}>{spec.label}</dt>
											<dd
												className={cn(s.display, s.specValue)}
												data-hud="spec-value"
											>
												{resolveValue(spec.value, 0)}
											</dd>
										</div>
									))}
								</dl>
							) : null}
						</div>

						<div className={s.finale}>
							<span
								className={cn(s.mono, s.square, s.finaleKicker)}
								style={{ "--i": 0 } as CSSProperties}
							>
								{product.finale.kicker}
							</span>
							{product.finale.headline ? (
								<span
									className={cn(s.display, s.finaleHeadline)}
									style={{ "--i": 1 } as CSSProperties}
								>
									{product.finale.headline}
								</span>
							) : null}
							{product.finale.specs.length ? (
								<dl
									className={s.finaleSpecs}
									style={{ "--i": 2 } as CSSProperties}
								>
									{product.finale.specs.map((spec) => (
										<div key={spec.label} className={s.finaleSpec}>
											<dt className={s.mono}>{spec.label}</dt>
											<dd className={s.display}>{spec.value}</dd>
										</div>
									))}
								</dl>
							) : null}
							<span
								className={cn(s.display, s.slogan)}
								style={{ "--i": 3.5 } as CSSProperties}
							>
								{product.finale.slogan.map((part) => (
									<span key={part.text}>
										{part.newline ? <br /> : null}
										<span className={part.accent ? s.sloganAccent : undefined}>
											{part.text}
										</span>
									</span>
								))}
							</span>
						</div>

						<div className={s.labels} data-hud="labels" />

						<div className={s.pip} data-hud="pip">
							<span
								className={cn(s.mono, s.square, s.pipTitle)}
								data-hud="pip-title"
							/>
						</div>
					</div>
					<div className={s.fade} aria-hidden="true" />

					{single ? null : (
						<nav
							ref={menuRef}
							className={s.menu}
							aria-label="Изделия: как работает"
						>
							{showcaseProducts.map((item) => {
								const active = item.id === productId;
								const isNext = item.id === next.id;
								return (
									<button
										key={item.id}
										type="button"
										data-product={item.id}
										className={cn(
											s.item,
											active && s.itemActive,
											isNext && s.itemNext,
										)}
										aria-pressed={active}
										aria-label={`${item.name} — показать, как работает`}
										onClick={() => select(item.id)}
									>
										<span className={s.itemKicker}>{item.menu[0]}</span>
										<span className={s.itemName}>{item.menu[1]}</span>
										<span className={s.itemTrack} aria-hidden="true" />
										<span className={s.itemNextTag} aria-hidden="true">
											Далее
										</span>
									</button>
								);
							})}
						</nav>
					)}

					{single ? null : (
						<div className={s.actions}>
							<button
								type="button"
								className={s.next}
								onClick={() => select(next.id)}
							>
								<span className={s.nextText}>
									<span className={s.nextKicker}>Смотреть, как работает</span>
									<span className={s.nextName}>{next.name}</span>
								</span>
								<span className={s.nextArrow} aria-hidden="true">
									<ArrowRight size={18} strokeWidth={2.2} />
								</span>
							</button>
						</div>
					)}

					<button type="button" className={s.skip} onClick={skip}>
						Пропустить ↓
					</button>
				</div>
			</div>

			{/* Текст роликов для скринридеров и поисковиков. */}
			<div className="sr-only">
				{single ? null : <p>{principle.intro}</p>}
				{(single ? [product] : showcaseProducts).map((item) => (
					<article key={item.id}>
						<h3>{item.name}</h3>
						<ol>
							{item.steps.map((step) => (
								<li key={step.title}>
									{step.title}
									{step.text ? `: ${step.text}` : ""}
								</li>
							))}
						</ol>
						<dl>
							{item.finale.specs.map((spec) => (
								<div key={spec.label}>
									<dt>{spec.label}</dt>
									<dd>{spec.value}</dd>
								</div>
							))}
						</dl>
					</article>
				))}
			</div>
		</section>
	);
}
