/**
 * Движок моушн-витрины.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * МОДЕЛЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Единственный вход — прогресс прокрутки p (0..1). Он переводится во время
 * ролика t = p · duration, и всё на экране — 3D-сцена, текст, счётчики,
 * выноски — функция от t. Поэтому прокрутка назад проигрывает ролик назад,
 * а не «перематывает» записанную анимацию.
 *
 * От живого времени зависят только «дыхание» сцены: вращение винтов,
 * покачивание в воздухе, мигание огней. Им незачем совпадать с текстом.
 *
 * React рисует каркас HUD (заголовки, подписи характеристик, меню) и
 * перерисовывает его только при смене изделия. Всё, что меняется на каждом
 * кадре, движок пишет в DOM сам: CSS-переменные на корне (--intro, --step,
 * --finale…), textContent у описания (набор текста), transform у выносок.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРОИЗВОДИТЕЛЬНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 *  - модуль грузится лениво (import() в компоненте) — three.js не попадает в
 *    первую загрузку главной;
 *  - цикл крутится, только пока блок на экране и вкладка активна;
 *  - число пикселей кадра ограничено (MAX_PIXELS): на 4K-мониторе bloom
 *    иначе съедает весь кадр;
 *  - сцены изделий строятся при первом показе и переиспользуются.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
	resolveValue,
	type ShowcaseProduct,
	type ShowcaseProductId,
	showcaseProducts,
} from "../content/showcase-content";
import { clamp01, disposeTree, lineMaterials, seg, smooth } from "./kit";
import { sceneFactories } from "./scenes/index";

/* ========================================================================== */
/* Контракт сцены                                                             */
/* ========================================================================== */

export interface LabelOptions {
	/** Мелкая моноширинная строка над значением. */
	sub?: string;
	/** Оранжевое значение (всё, что про сеть и перехват). */
	accent?: boolean;
	/** Крупная подпись («до 25 м» на кольце дальности). */
	large?: boolean;
	/** Принудительно влево от точки. */
	left?: boolean;
	/** Без точки и линии-выноски — просто текст у точки. */
	bare?: boolean;
}

export interface FrameContext {
	/** Секунды ролика. */
	t: number;
	/** Живое время, с. */
	time: number;
	dt: number;
	camera: THREE.PerspectiveCamera;
	reducedMotion: boolean;
	/** Поставить камеру. fov — вертикальный угол для кадра 16:9. */
	look: (position: THREE.Vector3, target: THREE.Vector3, fov?: number) => void;
	label: (
		key: string,
		text: string,
		world: THREE.Vector3,
		alpha: number,
		options?: LabelOptions,
	) => void;
	/** Картинка в картинке. */
	pip: (
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		title: string,
		alpha: number,
	) => void;
	/** Затемнение кадра 0..1 — для склейки «студия → поле». */
	fade: (amount: number) => void;
	shake: (amount: number) => void;
}

export interface ShowcaseScene {
	scene: THREE.Scene;
	/** Секунда первого выстрела: от неё считается таймер T−/T+. */
	zero: number;
	update: (ctx: FrameContext) => void;
	dispose?: () => void;
}

export type SceneFactory = (product: ShowcaseProduct) => ShowcaseScene;

/* ========================================================================== */
/* Движок                                                                     */
/* ========================================================================== */

export interface EngineClasses {
	label: string;
	labelLeft: string;
	labelAccent: string;
	labelLarge: string;
	labelBare: string;
	labelDot: string;
	labelLine: string;
	labelBody: string;
	labelSub: string;
	labelText: string;
}

export interface ShowcaseEngine {
	setProduct: (id: ShowcaseProductId) => void;
	setProgress: (p: number, immediate?: boolean) => void;
	destroy: () => void;
}

/** Предел пикселей кадра: ~1440p при DPR 1. Bloom дорогой. */
const MAX_PIXELS = 2.6e6;
/** Кадр, под который выставлены камеры сцен. */
const DESIGN_ASPECT = 16 / 9;

interface LabelNode {
	el: HTMLDivElement;
	sub: HTMLSpanElement;
	text: HTMLSpanElement;
	used: boolean;
	lastText: string;
	lastSub: string;
	lastClass: string;
}

export function createShowcaseEngine(opts: {
	canvas: HTMLCanvasElement;
	root: HTMLElement;
	classes: EngineClasses;
	initialProduct: ShowcaseProductId;
	reducedMotion: boolean;
}): ShowcaseEngine | null {
	const { canvas, root, classes, reducedMotion } = opts;

	let renderer: THREE.WebGLRenderer;
	try {
		renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			powerPreference: "high-performance",
			alpha: false,
		});
	} catch {
		return null;
	}
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.setClearColor(0x05080f, 1);

	const camera = new THREE.PerspectiveCamera(40, DESIGN_ASPECT, 0.02, 1200);
	// Цель рендера с MSAA: тонкие рёбра голограмм без лесенки.
	const target = new THREE.WebGLRenderTarget(1, 1, {
		type: THREE.HalfFloatType,
		samples: 4,
	});
	const composer = new EffectComposer(renderer, target);
	const renderPass = new RenderPass(new THREE.Scene(), camera);
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.5, 0.2);
	composer.addPass(renderPass);
	composer.addPass(bloom);
	composer.addPass(new OutputPass());

	const scenes = new Map<ShowcaseProductId, ShowcaseScene>();
	let product = productById(opts.initialProduct);

	const state = {
		target: 0,
		p: 0,
		time: 0,
		last: 0,
		w: 1,
		h: 1,
		dpr: 1,
		frame: 0,
		visible: false,
		shake: 0,
		fade: 0,
		stepIndex: -2,
		typed: -1,
		ended: false,
	};

	let active = getScene(product.id);

	/* ---- HUD -------------------------------------------------------------- */

	let hud = bindHud();

	function bindHud() {
		const q = <T extends Element>(name: string) =>
			root.querySelector<T & HTMLElement>(`[data-hud="${name}"]`);
		return {
			index: q<HTMLElement>("step-index"),
			title: q<HTMLElement>("step-title"),
			text: q<HTMLElement>("step-text"),
			bars: Array.from(root.querySelectorAll<HTMLElement>('[data-hud="bar"]')),
			specs: Array.from(
				root.querySelectorAll<HTMLElement>('[data-hud="spec-value"]'),
			),
			timer: q<HTMLElement>("timer"),
			labels: q<HTMLElement>("labels"),
			pip: q<HTMLElement>("pip"),
			pipTitle: q<HTMLElement>("pip-title"),
		};
	}

	const labelPool = new Map<string, LabelNode>();

	function makeLabelNode(): LabelNode {
		const el = document.createElement("div");
		const dot = document.createElement("span");
		dot.className = classes.labelDot;
		const line = document.createElement("span");
		line.className = classes.labelLine;
		const body = document.createElement("span");
		body.className = classes.labelBody;
		const sub = document.createElement("span");
		sub.className = classes.labelSub;
		const text = document.createElement("span");
		text.className = classes.labelText;
		body.append(sub, text);
		el.append(dot, line, body);
		hud.labels?.append(el);
		return {
			el,
			sub,
			text,
			used: false,
			lastText: "",
			lastSub: "",
			lastClass: "",
		};
	}

	const projected = new THREE.Vector3();

	const pendingLabels: Array<{
		key: string;
		text: string;
		world: THREE.Vector3;
		alpha: number;
		options?: LabelOptions;
	}> = [];

	function flushLabels() {
		for (const node of labelPool.values()) node.used = false;
		for (const item of pendingLabels) {
			if (item.alpha <= 0.01) continue;
			projected.copy(item.world).project(camera);
			if (projected.z > 1 || projected.z < -1) continue;
			const x = (projected.x * 0.5 + 0.5) * state.w;
			const y = (-projected.y * 0.5 + 0.5) * state.h;
			if (x < -40 || x > state.w + 40 || y < -40 || y > state.h + 40) continue;
			let node = labelPool.get(item.key);
			if (!node) {
				node = makeLabelNode();
				labelPool.set(item.key, node);
			}
			node.used = true;
			const o = item.options ?? {};
			const left = o.left ?? x > state.w * 0.68;
			const cls = [
				classes.label,
				left ? classes.labelLeft : "",
				o.accent ? classes.labelAccent : "",
				o.large ? classes.labelLarge : "",
				o.bare ? classes.labelBare : "",
			]
				.filter(Boolean)
				.join(" ");
			if (cls !== node.lastClass) {
				node.el.className = cls;
				node.lastClass = cls;
			}
			if (item.text !== node.lastText) {
				node.text.textContent = item.text;
				node.lastText = item.text;
			}
			const sub = o.sub ?? "";
			if (sub !== node.lastSub) {
				node.sub.textContent = sub;
				node.lastSub = sub;
			}
			node.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
			node.el.style.opacity = item.alpha.toFixed(3);
		}
		for (const node of labelPool.values()) {
			if (!node.used && node.el.style.opacity !== "0")
				node.el.style.opacity = "0";
		}
		pendingLabels.length = 0;
	}

	let pipRequest: {
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		title: string;
		alpha: number;
	} | null = null;

	function renderPip() {
		const frame = hud.pip;
		const alpha = pipRequest?.alpha ?? 0;
		root.style.setProperty("--pip", alpha.toFixed(3));
		if (!frame || !pipRequest || alpha < 0.02) return;
		if (hud.pipTitle && hud.pipTitle.textContent !== pipRequest.title) {
			hud.pipTitle.textContent = pipRequest.title;
		}
		const fr = frame.getBoundingClientRect();
		const cr = canvas.getBoundingClientRect();
		const x = fr.left - cr.left;
		const y = fr.top - cr.top;
		if (fr.width < 10 || fr.height < 10) return;
		const pipCam = pipRequest.camera;
		pipCam.aspect = fr.width / fr.height;
		pipCam.updateProjectionMatrix();
		renderer.setScissorTest(true);
		renderer.setScissor(x, state.h - y - fr.height, fr.width, fr.height);
		renderer.setViewport(x, state.h - y - fr.height, fr.width, fr.height);
		renderer.clear();
		renderer.render(pipRequest.scene, pipCam);
		renderer.setScissorTest(false);
		renderer.setViewport(0, 0, state.w, state.h);
	}

	/* ---- Камера ------------------------------------------------------------ */

	const camPos = new THREE.Vector3();
	const camTarget = new THREE.Vector3();
	const tmp = new THREE.Vector3();

	function look(position: THREE.Vector3, at: THREE.Vector3, fov = 40) {
		camPos.copy(position);
		camTarget.copy(at);
		const aspect = state.w / state.h;
		// Горизонтальный угол кадра 16:9 сохраняется на узких экранах: вертикальный
		// угол растёт до разумного предела, остаток добирается отъездом камеры.
		const hDesign =
			2 *
			Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * DESIGN_ASPECT);
		let vfov = THREE.MathUtils.degToRad(fov);
		let dolly = 1;
		if (aspect < DESIGN_ASPECT) {
			const need = 2 * Math.atan(Math.tan(hDesign / 2) / aspect);
			vfov = Math.min(need, THREE.MathUtils.degToRad(aspect < 1 ? 68 : 58));
			const hActual = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
			dolly = (Math.tan(hDesign / 2) / Math.tan(hActual / 2)) ** 0.82;
		}
		if (dolly !== 1) {
			tmp.subVectors(camPos, camTarget).multiplyScalar(dolly);
			camPos.copy(camTarget).add(tmp);
		}
		camera.fov = THREE.MathUtils.radToDeg(vfov);
		camera.position.copy(camPos);
		if (state.shake > 0 && !reducedMotion) {
			const k = state.shake;
			camTarget.x += Math.sin(state.time * 93) * k;
			camTarget.y += Math.cos(state.time * 71) * k;
		}
		camera.lookAt(camTarget);
		// На вертикальном экране низ занят текстом — поднимаем картинку.
		const lift = aspect < 1 ? 0.14 : aspect < 1.3 ? 0.07 : 0;
		if (lift > 0) {
			camera.setViewOffset(
				state.w,
				state.h * (1 + lift),
				0,
				state.h * lift,
				state.w,
				state.h,
			);
		} else camera.clearViewOffset();
		camera.updateProjectionMatrix();
	}

	/* ---- Кадр -------------------------------------------------------------- */

	const ctx: FrameContext = {
		t: 0,
		time: 0,
		dt: 0,
		camera,
		reducedMotion,
		look,
		label(key, text, world, alpha, options) {
			pendingLabels.push({ key, text, world: world.clone(), alpha, options });
		},
		pip(scene, cam, title, alpha) {
			if (!pipRequest || alpha >= pipRequest.alpha)
				pipRequest = { scene, camera: cam, title, alpha };
		},
		fade(amount) {
			state.fade = Math.max(state.fade, amount);
		},
		shake(amount) {
			state.shake = Math.max(state.shake, amount);
		},
	};

	function frame(dt: number) {
		const t = state.p * product.duration;
		state.shake = 0;
		state.fade = 0;
		pipRequest = null;
		ctx.t = t;
		ctx.time = state.time;
		ctx.dt = dt;
		active.update(ctx);
		updateHud(t);
		root.style.setProperty("--fade", state.fade.toFixed(3));

		renderPass.scene = active.scene;
		composer.render(dt);
		renderPip();
		flushLabels();
	}

	function updateHud(t: number) {
		const s = root.style;
		const steps = product.steps;
		const finale = product.finale.start;
		s.setProperty("--p", state.p.toFixed(4));
		s.setProperty(
			"--intro",
			(1 - smooth(product.introEnd - 0.7, product.introEnd, t)).toFixed(3),
		);
		s.setProperty(
			"--hdr",
			smooth(product.introEnd - 0.6, product.introEnd + 0.2, t).toFixed(3),
		);
		const specs = Math.min(
			smooth(product.introEnd, product.introEnd + 0.6, t),
			1 - smooth(finale - 0.6, finale, t),
		);
		s.setProperty("--specs", specs.toFixed(3));
		s.setProperty("--finale", seg(t, finale, finale + 2.2).toFixed(3));

		let index = -1;
		for (let i = 0; i < steps.length; i += 1)
			if (t >= steps[i].start) index = i;
		if (t >= finale) index = -1;
		const step = index >= 0 ? steps[index] : null;
		if (index !== state.stepIndex) {
			state.stepIndex = index;
			state.typed = -1;
			if (step) {
				if (hud.index) {
					hud.index.textContent = `${String(index + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`;
				}
				if (hud.title) hud.title.textContent = step.title;
			}
		}
		const stepVis = step
			? Math.min(
					smooth(step.start, step.start + 0.35, t),
					1 - smooth(finale - 0.5, finale, t),
				)
			: 0;
		s.setProperty("--step", stepVis.toFixed(3));
		s.setProperty(
			"--title",
			(step ? easeTitle(seg(t, step.start, step.start + 0.55)) : 0).toFixed(3),
		);
		s.setProperty(
			"--dim",
			(step
				? smooth(step.start + step.hold, step.start + step.hold + 0.45, t)
				: 0
			).toFixed(3),
		);
		// Набор описания: скорость ~55 знаков в секунду ролика.
		const text = step?.text ?? "";
		const typeFrom = step ? step.start + 0.3 : 0;
		const typeDur = Math.max(0.6, text.length / 55);
		const chars = Math.round(
			seg(t, typeFrom, typeFrom + typeDur) * text.length,
		);
		if (chars !== state.typed && hud.text) {
			state.typed = chars;
			hud.text.textContent = text.slice(0, chars);
		}
		root.dataset.typing = step && chars > 0 && chars < text.length ? "1" : "0";

		hud.bars.forEach((bar, i) => {
			const fill =
				i < index ? 1 : i === index && step ? seg(t, step.start, step.end) : 0;
			bar.style.setProperty("--fill", fill.toFixed(3));
		});
		hud.specs.forEach((el, i) => {
			const spec = product.specs[i];
			if (!spec) return;
			const v = resolveValue(spec.value, t);
			if (el.textContent !== v) el.textContent = v;
		});
		if (hud.timer) {
			const d = t - active.zero;
			const txt = `T${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)} с`;
			if (hud.timer.textContent !== txt) hud.timer.textContent = txt;
		}
		const ended = t >= product.duration - 2.6;
		if (ended !== state.ended) {
			state.ended = ended;
			root.dataset.ended = ended ? "1" : "0";
		}
	}

	/* ---- Цикл -------------------------------------------------------------- */

	function tick(now: number) {
		state.frame = 0;
		const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 1 / 60;
		state.last = now;
		state.time += dt;
		// Сглаживание прокрутки: колесо двигает страницу ступенями, ролик
		// догоняет их плавно. Константа подобрана так, чтобы не было ощущения
		// «резины»: 90% пути — примерно за четверть секунды.
		const diff = state.target - state.p;
		state.p =
			Math.abs(diff) < 1e-5
				? state.target
				: state.p + diff * (1 - Math.exp(-dt * 9));
		frame(dt);
		schedule();
	}

	function schedule() {
		if (!state.visible || state.frame || document.hidden) return;
		state.frame = requestAnimationFrame(tick);
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		state.w = Math.max(1, rect.width);
		state.h = Math.max(1, rect.height);
		const dpr = Math.min(
			window.devicePixelRatio || 1,
			2,
			Math.sqrt(MAX_PIXELS / (state.w * state.h)),
		);
		renderer.setPixelRatio(dpr);
		renderer.setSize(state.w, state.h, false);
		composer.setPixelRatio(dpr);
		composer.setSize(state.w, state.h);
		bloom.resolution.set(state.w * dpr, state.h * dpr);
		camera.aspect = state.w / state.h;
		camera.updateProjectionMatrix();
		state.dpr = dpr;
		syncLines();
		if (!state.frame) frame(0);
	}

	/** LineMaterial меряет толщину в пикселях буфера — подгоняем под DPR. */
	function syncLines() {
		for (const m of lineMaterials) {
			m.resolution.set(state.w * state.dpr, state.h * state.dpr);
			const base = (m.userData.baseWidth as number | undefined) ?? m.linewidth;
			m.userData.baseWidth = base;
			m.linewidth = base * state.dpr;
		}
	}

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(canvas);

	const io = new IntersectionObserver(
		([entry]) => {
			state.visible = entry.isIntersecting;
			state.last = 0;
			schedule();
		},
		{ rootMargin: "20% 0px" },
	);
	io.observe(root);

	const onVisibility = () => {
		state.last = 0;
		schedule();
	};
	document.addEventListener("visibilitychange", onVisibility);

	const onLost = (e: Event) => e.preventDefault();
	canvas.addEventListener("webglcontextlost", onLost);

	resize();

	/* ---- Сцены ------------------------------------------------------------- */

	function productById(id: ShowcaseProductId) {
		return showcaseProducts.find((p) => p.id === id) ?? showcaseProducts[0];
	}

	function getScene(id: ShowcaseProductId) {
		let s = scenes.get(id);
		if (!s) {
			s = sceneFactories[id](productById(id));
			scenes.set(id, s);
			syncLines();
		}
		return s;
	}

	return {
		setProduct(id) {
			product = productById(id);
			active = getScene(id);
			for (const node of labelPool.values()) node.el.remove();
			labelPool.clear();
			hud = bindHud();
			state.stepIndex = -2;
			state.typed = -1;
			state.ended = false;
			root.dataset.ended = "0";
			if (!state.frame) frame(0);
		},
		setProgress(p, immediate = false) {
			state.target = clamp01(p);
			if (immediate || reducedMotion) state.p = state.target;
			schedule();
		},
		destroy() {
			if (state.frame) cancelAnimationFrame(state.frame);
			resizeObserver.disconnect();
			io.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			canvas.removeEventListener("webglcontextlost", onLost);
			for (const s of scenes.values()) {
				s.dispose?.();
				disposeTree(s.scene);
			}
			for (const node of labelPool.values()) node.el.remove();
			lineMaterials.clear();
			composer.dispose();
			target.dispose();
			renderer.dispose();
		},
	};
}

/** Проявление заголовка такта: быстрое начало, мягкий хвост. */
function easeTitle(x: number) {
	return 1 - (1 - x) ** 4;
}
