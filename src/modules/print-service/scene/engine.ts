/**
 * Движок сцены 3D-печати.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * МОДЕЛЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Единственный вход — номер главы s (дробный: 1.5 — ровно между первой и
 * второй главой). Его считает страница из прокрутки, движок сглаживает и
 * ставит камеру на маршрут через кадры SHOTS. Внутри отрезка между кадрами
 * движение замедляется к концам: на каждой главе камера «встаёт», пока
 * читается текст, и разгоняется между ними.
 *
 * От живого времени зависят только принтеры (стол, голова, катушки) и
 * лёгкое «дыхание» камеры — им незачем совпадать с прокруткой. Готовность
 * деталей на столе крупного плана — функция s: прокрутка допечатывает их.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРОИЗВОДИТЕЛЬНОСТЬ
 * ────────────────────────────────────────────────────────────────────────────
 *  - модуль грузится лениво (import() в компоненте);
 *  - статика запечена: ~20 вызовов отрисовки на неё, ~70 на подвижное;
 *  - без постобработки и карт теней — контактные тени нарисованы пятнами;
 *  - цикл крутится, только пока сцена на экране и вкладка активна;
 *  - число пикселей кадра ограничено, а если кадр стабильно не укладывается
 *    в бюджет, разрешение понижается само (adaptive DPR);
 *  - prefers-reduced-motion: ни пролётов, ни движения принтеров — камера
 *    стоит на кадре текущей главы, кадр перерисовывается только при смене.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
	BACKGROUND,
	buildPrintStage,
	PRINT_SHOT,
	poseRig,
	SHOTS,
} from "./stage";

export interface PrintEngine {
	setShot: (s: number, immediate?: boolean) => void;
	destroy: () => void;
}

/** Предел пикселей кадра: ~1440p при DPR 1. */
const MAX_PIXELS = 2.4e6;
/** Кадр, под который выставлены камеры. */
const DESIGN_ASPECT = 16 / 9;
/** Бюджет кадра, после которого понижается разрешение (≈32 к/с). */
const SLOW_FRAME = 1 / 32;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

export function createPrintEngine(opts: {
	canvas: HTMLCanvasElement;
	root: HTMLElement;
	reducedMotion: boolean;
}): PrintEngine | null {
	const { canvas, root, reducedMotion } = opts;

	let renderer: THREE.WebGLRenderer;
	try {
		renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: "high-performance",
			alpha: false,
		});
	} catch {
		return null;
	}
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.setClearColor(BACKGROUND, 1);

	// Тени: карта считается один раз — на телефоне в половинном разрешении.
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	const stage = buildPrintStage(
		Math.min(window.innerWidth, window.innerHeight) < 600 ? 1024 : 2048,
	);
	const { scene } = stage;

	// Отражения от «комнаты» — один раз при старте, дальше бесплатно.
	const pmrem = new THREE.PMREMGenerator(renderer);
	const room = new RoomEnvironment();
	const envTarget = pmrem.fromScene(room, 0.04);
	scene.environment = envTarget.texture;
	scene.environmentIntensity = 0.38;
	room.dispose();
	pmrem.dispose();

	const camera = new THREE.PerspectiveCamera(36, DESIGN_ASPECT, 0.03, 40);

	const positions = new THREE.CatmullRomCurve3(
		SHOTS.map((shot) => shot.position),
		false,
		"centripetal",
	);
	const targets = new THREE.CatmullRomCurve3(
		SHOTS.map((shot) => shot.target),
		false,
		"centripetal",
	);
	const last = SHOTS.length - 1;

	const state = {
		target: 0,
		s: 0,
		time: 0,
		last: 0,
		w: 1,
		h: 1,
		frame: 0,
		visible: false,
		dprScale: 1,
		slowFrames: 0,
		sampled: 0,
	};

	/* ---- Камера ------------------------------------------------------------ */

	const pos = new THREE.Vector3();
	const at = new THREE.Vector3();
	const tmp = new THREE.Vector3();

	function placeCamera(s: number) {
		const i = Math.min(Math.floor(s), last - 1);
		const e = easeInOut(clamp01(s - i));
		const u = (i + e) / last;
		positions.getPoint(u, pos);
		targets.getPoint(u, at);
		const fov = THREE.MathUtils.lerp(SHOTS[i].fov, SHOTS[i + 1].fov, e);
		const side = THREE.MathUtils.lerp(SHOTS[i].side, SHOTS[i + 1].side, e);

		if (!reducedMotion) {
			pos.x += Math.sin(state.time * 0.23) * 0.025;
			pos.y += Math.sin(state.time * 0.31 + 1) * 0.015;
		}

		const aspect = state.w / state.h;
		// Горизонтальный угол кадра 16:9 сохраняется на узких экранах:
		// вертикальный растёт до предела, остаток добирается отъездом камеры.
		const hDesign =
			2 *
			Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * DESIGN_ASPECT);
		let vfov = THREE.MathUtils.degToRad(fov);
		if (aspect < DESIGN_ASPECT) {
			const need = 2 * Math.atan(Math.tan(hDesign / 2) / aspect);
			vfov = Math.min(need, THREE.MathUtils.degToRad(aspect < 1 ? 64 : 54));
			const hActual = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
			const dolly = (Math.tan(hDesign / 2) / Math.tan(hActual / 2)) ** 0.75;
			tmp.subVectors(pos, at).multiplyScalar(dolly);
			pos.copy(at).add(tmp);
		}
		camera.fov = THREE.MathUtils.radToDeg(vfov);
		camera.aspect = aspect;
		camera.position.copy(pos);
		camera.lookAt(at);

		// Предмет кадра — в стороне, свободной от текста. На широком экране
		// текст сбоку, на вертикальном — снизу: картинка поднимается.
		if (aspect >= 1.1) {
			camera.setViewOffset(
				state.w,
				state.h,
				-side * 0.4 * state.w,
				0,
				state.w,
				state.h,
			);
		} else {
			const lift = aspect < 0.8 ? 0.17 : 0.1;
			camera.setViewOffset(
				state.w,
				state.h,
				0,
				lift * state.h,
				state.w,
				state.h,
			);
		}
		camera.updateProjectionMatrix();
	}

	/* ---- Кадр -------------------------------------------------------------- */

	function frame(dt: number) {
		const s = state.s;
		const motion = reducedMotion ? 0 : 1;
		// Крупный план: детали допечатываются, пока глава проезжает.
		stage.hero.progress = 0.08 + 0.92 * clamp01((s - (PRINT_SHOT - 0.8)) / 1.6);
		for (const rig of stage.rigs)
			poseRig(rig, rig.progress, state.time, motion);
		if (motion) {
			stage.spools.forEach((spool, index) => {
				spool.rotation.x += dt * (index % 2 ? -0.35 : 0.35);
			});
		}
		placeCamera(s);
		renderer.render(scene, camera);
	}

	/* ---- Цикл -------------------------------------------------------------- */

	function tick(now: number) {
		state.frame = 0;
		const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 1 / 60;
		const raw = state.last ? (now - state.last) / 1000 : 0;
		state.last = now;
		state.time += dt;
		// Колесо двигает страницу ступенями — камера догоняет их плавно:
		// 90% пути примерно за 0.4 с.
		const diff = state.target - state.s;
		state.s =
			Math.abs(diff) < 1e-4
				? state.target
				: state.s + diff * (1 - Math.exp(-dt * 6));
		frame(dt);
		adapt(raw);
		schedule();
	}

	function schedule() {
		if (!state.visible || state.frame || document.hidden) return;
		// Без движения перерисовывать нечего: кадр рисуется при смене главы.
		if (reducedMotion) return;
		state.frame = requestAnimationFrame(tick);
	}

	/**
	 * Если кадр стабильно дольше бюджета, разрешение понижается шагами до
	 * 0.6 от исходного. Обратно не повышается: скачки качества на глазах
	 * заметнее, чем чуть более мягкая картинка.
	 */
	function adapt(raw: number) {
		if (raw <= 0 || raw > 0.25) return;
		state.sampled += 1;
		if (raw > SLOW_FRAME) state.slowFrames += 1;
		if (state.sampled < 90) return;
		if (state.slowFrames > 60 && state.dprScale > 0.6) {
			state.dprScale = Math.max(0.6, state.dprScale * 0.8);
			resize();
		}
		state.sampled = 0;
		state.slowFrames = 0;
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		state.w = Math.max(1, rect.width);
		state.h = Math.max(1, rect.height);
		const dpr =
			Math.min(
				window.devicePixelRatio || 1,
				1.75,
				Math.sqrt(MAX_PIXELS / (state.w * state.h)),
			) * state.dprScale;
		renderer.setPixelRatio(dpr);
		renderer.setSize(state.w, state.h, false);
		if (!state.frame) frame(0);
	}

	const resizeObserver = new ResizeObserver(() => resize());
	resizeObserver.observe(canvas);

	const io = new IntersectionObserver(
		([entry]) => {
			state.visible = entry.isIntersecting;
			state.last = 0;
			schedule();
		},
		{ rootMargin: "10% 0px" },
	);
	io.observe(root);

	const onVisibility = () => {
		state.last = 0;
		schedule();
	};
	document.addEventListener("visibilitychange", onVisibility);

	const onLost = (event: Event) => event.preventDefault();
	canvas.addEventListener("webglcontextlost", onLost);

	resize();

	return {
		setShot(s, immediate = false) {
			const value = Math.max(0, Math.min(last, s));
			if (reducedMotion) {
				// Без пролётов: кадр ближайшей главы, перерисовка только при смене.
				const snapped = Math.round(value);
				if (snapped === state.s && !immediate) return;
				state.target = snapped;
				state.s = snapped;
				frame(0);
				return;
			}
			state.target = value;
			if (immediate) state.s = value;
			schedule();
		},
		destroy() {
			if (state.frame) cancelAnimationFrame(state.frame);
			resizeObserver.disconnect();
			io.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
			canvas.removeEventListener("webglcontextlost", onLost);
			stage.dispose();
			envTarget.dispose();
			renderer.dispose();
		},
	};
}
