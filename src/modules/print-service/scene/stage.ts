/**
 * Сборка сцены цеха и маршрут камеры.
 *
 * Ряд из стеллажей вдоль оси X, за ним второй ряд в глубине — он тонет в
 * тумане и даёт ощущение большого цеха, не требуя деталей. Камера облетает
 * передний ряд: общий план → полка открытых принтеров → стол с деталями
 * крупно → катушки → закрытые принтеры → общий план вдоль ряда (форма).
 *
 * Анимируются только принтеры переднего ряда на двух стеллажах (8 штук);
 * всё остальное запекается в статику вместе со стеллажами.
 */

import * as THREE from "three";
import {
	bakeStatic,
	buildCarton,
	buildEmptySpools,
	buildEnclosedPrinter,
	buildFeeder,
	buildOpenPrinter,
	buildRack,
	buildRoom,
	makeMaterials,
	type PrinterRig,
	RACK,
} from "./models";

export interface Shot {
	position: THREE.Vector3;
	target: THREE.Vector3;
	/** Вертикальный угол обзора для кадра 16:9. */
	fov: number;
	/**
	 * Где стоит предмет кадра на широком экране: −1 — левый край, +1 —
	 * правый. Противоположная сторона отдана тексту главы.
	 */
	side: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Кадры по главам страницы — порядок совпадает с главами в content. */
export const SHOTS: Shot[] = [
	// 0. Первый экран: оба стеллажа переднего ряда, взгляд сверху-сбоку.
	{
		position: v(4.5, 2.4, 5.4),
		target: v(1.25, 0.82, 0),
		fov: 34,
		side: 0.36,
	},
	// 1. Полка открытых принтеров.
	{
		position: v(1.05, 1.28, 2.05),
		target: v(-0.05, 0.92, 0),
		fov: 34,
		side: 0.4,
	},
	// 2. Стол с деталями крупно — печать идёт за прокруткой.
	{
		position: v(-0.91, 1.34, 0.66),
		target: v(-0.57, 0.95, 0.02),
		fov: 34,
		side: -0.4,
	},
	// 3. Стойка катушек.
	{
		position: v(0.42, 1.36, 1.08),
		target: v(-0.1, 1.17, 0),
		fov: 34,
		side: 0.4,
	},
	// 4. Закрытые принтеры.
	{
		position: v(1.25, 1.32, 1.5),
		target: v(2.05, 1.02, 0.05),
		fov: 34,
		side: -0.4,
	},
	// 5. Заявка: общий план вдоль ряда, принтеры слева, форма справа.
	{
		position: v(-1.55, 1.05, 3.3),
		target: v(1.0, 0.82, 0),
		fov: 38,
		side: -0.5,
	},
];

/** Глава, в которой печать идёт за прокруткой, и диапазон «готовности». */
export const PRINT_SHOT = 2;

export interface PrintStage {
	scene: THREE.Scene;
	rigs: PrinterRig[];
	hero: PrinterRig;
	/** Катушки стоек подачи — крутятся, пока идёт печать. */
	spools: THREE.Object3D[];
	dispose: () => void;
}

export const BACKGROUND = 0x0b0d12;

export function buildPrintStage(shadowMapSize: number): PrintStage {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(BACKGROUND);
	scene.fog = new THREE.Fog(BACKGROUND, 5.5, 13);

	const m = makeMaterials();
	const fixed = new THREE.Group();
	const moving = new THREE.Group();
	scene.add(moving);

	buildRoom(m, fixed);

	const rigs: PrinterRig[] = [];
	const spools: THREE.Object3D[] = [];
	const [, deck1, deck2] = RACK.decks;
	const deck0 = RACK.decks[0];

	/* ---- Стеллаж A: открытые принтеры, у каждого своя стойка катушек ----- */
	buildRack(m, fixed, v(0, 0, 0));
	for (const level of [deck0, deck1]) openBay(0, level, true);
	buildEmptySpools(m, fixed, v(-0.7, deck2, -0.05), 5);
	buildCarton(m, fixed, v(0.45, deck2, 0), [0.46, 0.34, 0.44], 0.08);

	/* ---- Стеллаж B: закрытые принтеры ------------------------------------- */
	buildRack(m, fixed, v(2, 0, 0));
	for (const level of [deck0, deck1]) {
		rigs.push(
			buildEnclosedPrinter(m, fixed, moving, v(1.58, level, 0), true),
			buildEnclosedPrinter(m, fixed, moving, v(2.42, level, 0), true),
		);
	}
	buildCarton(m, fixed, v(1.55, deck2, 0), [0.5, 0.36, 0.48], -0.05);
	buildCarton(m, fixed, v(2.4, deck2, 0.02), [0.5, 0.36, 0.48], 0.04);

	/* ---- Продолжение ряда и второй ряд — статичные ------------------------ */
	buildRack(m, fixed, v(-2, 0, 0));
	for (const level of [deck0, deck1]) openBay(-2, level, false);
	buildRack(m, fixed, v(4, 0, 0));
	for (const level of [deck0, deck1]) {
		for (const x of [3.58, 4.42]) {
			freeze(buildEnclosedPrinter(m, fixed, fixed, v(x, level, 0), false), x);
		}
	}
	for (const x of [-1, 1, 3]) {
		buildRack(m, fixed, v(x, 0, -2.2));
		for (const level of [deck0, deck1]) {
			for (const dx of [-0.42, 0.42]) {
				freeze(
					buildEnclosedPrinter(m, fixed, fixed, v(x + dx, level, -2.2), false),
					x * 3 + dx + level,
				);
			}
		}
	}

	/* ---- Коробки на полу, как на фото цеха -------------------------------- */
	buildCarton(m, fixed, v(3.05, 0, 0.85), [0.44, 0.52, 0.42], 0.25);
	buildCarton(m, fixed, v(-1.05, 0, 0.75), [0.52, 0.4, 0.42], -0.3);

	// Разные стадии печати и фазы движения — ряд не должен шагать в ногу.
	rigs.forEach((rig, index) => {
		rig.phase = index * 1.37;
		rig.progress = 0.35 + ((index * 0.29) % 0.6);
	});
	const hero = rigs[2]; // стеллаж A, средняя полка, левый принтер

	const baked = bakeStatic(fixed);
	scene.add(baked);
	moving.traverse((node) => {
		if (node instanceof THREE.Mesh) node.receiveShadow = true;
	});

	/* ---- Свет ------------------------------------------------------------- */
	scene.add(new THREE.HemisphereLight(0xd6deff, 0x3a1a14, 0.42));
	// Ключевой свет даёт тени полок на принтерах. Карта теней считается ОДИН
	// раз (shadowMap.autoUpdate = false в движке): отбрасывает тень только
	// запечённая статика, а она не двигается.
	const key = new THREE.DirectionalLight(0xfff1e0, 2.1);
	key.position.set(3.2, 5, 4.2);
	key.target.position.set(1, 0.6, 0);
	key.castShadow = true;
	key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
	key.shadow.bias = -0.0004;
	key.shadow.normalBias = 0.02;
	key.shadow.radius = 3;
	Object.assign(key.shadow.camera, {
		left: -3.2,
		right: 3.4,
		top: 2.6,
		bottom: -2.4,
		near: 2,
		far: 12,
	});
	scene.add(key, key.target);
	const fill = new THREE.DirectionalLight(0x9fb8ff, 0.45);
	fill.position.set(-4, 2.5, 2);
	scene.add(fill);

	return {
		scene,
		rigs,
		hero,
		spools: [...spools, ...rigs.flatMap((rig) => rig.spools)],
		dispose() {
			scene.traverse((node) => {
				if (node instanceof THREE.Mesh) node.geometry.dispose();
			});
			for (const material of Object.values(m)) {
				const map = (material as THREE.MeshStandardMaterial).map;
				const alphaMap = (material as THREE.MeshStandardMaterial).alphaMap;
				map?.dispose();
				alphaMap?.dispose();
				material.dispose();
			}
		},
	};

	/**
	 * Полка стеллажа с открытыми принтерами, как на фото: принтер, справа от
	 * него его стойка катушек, трубки от стойки — в хаб на арке принтера.
	 */
	function openBay(cx: number, level: number, animated: boolean) {
		const root = animated ? moving : fixed;
		for (const dx of [-0.59, 0.27]) {
			const rig = buildOpenPrinter(
				m,
				fixed,
				root,
				v(cx + dx, level, 0),
				animated,
			);
			const feeder = buildFeeder(
				m,
				fixed,
				root,
				v(cx + dx + 0.43, level, -0.02),
				animated,
				rig.hubInlets,
			);
			if (animated) {
				rigs.push(rig);
				spools.push(...feeder);
			} else freeze(rig, cx + dx + level);
		}
	}

	/** Поставить неподвижный принтер в правдоподобную позу перед запеканием. */
	function freeze(rig: PrinterRig, seed: number) {
		const progress = 0.3 + Math.abs(Math.sin(seed * 12.9898)) * 0.65;
		poseRig(rig, progress, seed, 0);
	}
}

/**
 * Поза принтера в момент времени: стол и голова ходят «как при печати»
 * (сумма синусов — без видимого периода), высота головы следует за
 * высотой деталей на столе.
 */
export function poseRig(
	rig: PrinterRig,
	progress: number,
	time: number,
	motion: number,
) {
	const t = time + rig.phase;
	const p = Math.max(0.04, Math.min(1, progress));
	rig.parts.scale.y = p;
	if (rig.kind === "open") {
		if (rig.bed)
			rig.bed.position.z =
				motion * (0.075 * Math.sin(t * 1.9) + 0.025 * Math.sin(t * 5.3));
		rig.head.position.x =
			motion * (0.1 * Math.sin(t * 2.6 + 1) + 0.03 * Math.sin(t * 7.1));
		// Верх стола (0.094) + детали + вылет сопла под головой.
		if (rig.beam) rig.beam.position.y = 0.094 + rig.partHeight * p + 0.078;
	} else {
		if (rig.beam)
			rig.beam.position.z =
				motion * (0.08 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 6.7));
		rig.head.position.x =
			motion * (0.11 * Math.sin(t * 2.9 + 2) + 0.025 * Math.sin(t * 8.3));
	}
	routeFeed(rig);
}

const route = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());

/**
 * Трубка подачи следует за головой: вывод → изгиб от вывода → середина
 * петли → над входом → вход головы.
 */
function routeFeed(rig: PrinterRig) {
	const { feed } = rig;
	const [from, lead, middle, above, inlet] = route;
	rig.head.updateWorldMatrix(true, false);
	inlet.copy(feed.inlet).applyMatrix4(rig.head.matrixWorld);
	from.copy(feed.from);
	lead.copy(feed.from).add(feed.lead);
	above.copy(inlet);
	above.y += feed.rise;
	middle.lerpVectors(lead, above, 0.5);
	middle.y += feed.rise * 0.35;
	feed.tube.update(route);
}
