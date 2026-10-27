/**
 * Модели сцены 3D-печати: стеллаж цеха и два типа принтеров.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПО ФОТОГРАФИЯМ ЦЕХА
 * ────────────────────────────────────────────────────────────────────────────
 * На снимках два вида принтеров, и оба узнаются по силуэту:
 *  — открытый «кроватный» принтер (Bambu Lab A1): белое основание, стол
 *    ездит вперёд-назад, серебристая П-образная арка, по ней вверх-вниз
 *    ходит балка с печатающей головой; рядом — стойка подачи на четыре
 *    катушки (AMS lite) с жёлтыми фиксаторами;
 *  — закрытый принтер-куб (P1S-подобный): серый корпус, стеклянная дверь и
 *    крышка, внутри портал CoreXY, катушка висит на боковой стенке.
 * Стоят они на стеллажах с синими перфорированными стойками, оранжевыми
 * балками и фанерными полками, пол — красно-коричневый наливной. Именно эти
 * цвета и делают сцену «той самой» — точность размеров вторична.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ВСЁ ПРОЦЕДУРНОЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Ни одной загружаемой модели или картинки: примитивы three.js (скруглённые
 * коробки, цилиндры, трубки) и две крошечные текстуры, нарисованные на
 * canvas при старте. Сцена весит столько, сколько весит сам three.js.
 *
 * Неподвижное (стеллажи, корпуса, пол) после сборки «запекается»: геометрия
 * сливается в один меш на материал (bakeStatic). Так вся статика — около
 * двадцати вызовов отрисовки вместо нескольких сотен. Отдельными мешами
 * остаётся только то, что движется: столы, балки, головы, катушки.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/* ========================================================================== */
/* Материалы                                                                  */
/* ========================================================================== */

export type Materials = ReturnType<typeof makeMaterials>;

const std = (
	color: number,
	roughness: number,
	metalness = 0,
	extra: THREE.MeshStandardMaterialParameters = {},
) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function makeMaterials() {
	return {
		white: std(0xe8eaee, 0.42),
		lightGray: std(0xc3c7ce, 0.5),
		alu: std(0xb9c0c9, 0.32, 0.75),
		dark: std(0x35393f, 0.55, 0.2),
		black: std(0x17191c, 0.5),
		plate: std(0x2b2d31, 0.45, 0.35),
		part: std(0x121316, 0.55),
		filament: std(0x0c0d0f, 0.28),
		filamentLight: std(0xd9d3c4, 0.4),
		spoolTan: std(0xb08757, 0.85),
		yellow: std(0xf2b705, 0.45),
		screen: std(0x0b1018, 0.25, 0, {
			emissive: new THREE.Color(0x1c3350),
			emissiveIntensity: 0.7,
		}),
		upright: std(0xffffff, 0.5, 0.25, { map: makePerforationTexture() }),
		beam: std(0xe9521d, 0.48, 0.15),
		plywood: std(0xcdaa79, 0.82),
		floor: std(0x5b231c, 0.3),
		enclosure: std(0x63666c, 0.6, 0.1),
		interior: std(0x1a1c20, 0.8),
		glass: std(0x1c232c, 0.06, 0.1, {
			transparent: true,
			opacity: 0.26,
			depthWrite: false,
		}),
		chamberLight: std(0x000000, 1, 0, {
			emissive: new THREE.Color(0xfff0d8),
			emissiveIntensity: 2.2,
		}),
		cardboard: std(0xa9804f, 0.9),
		tape: std(0xd8c49a, 0.6),
		bin: std(0x2f63c9, 0.5),
		ledPanel: std(0x000000, 1, 0, {
			emissive: new THREE.Color(0xeaf1ff),
			emissiveIntensity: 1.6,
		}),
		wall: std(0x14171c, 0.95),
		window: std(0x000000, 1, 0, {
			emissive: new THREE.Color(0x24344a),
			emissiveIntensity: 0.55,
		}),
		shadow: new THREE.MeshBasicMaterial({
			color: 0x000000,
			alphaMap: makeShadowTexture(),
			transparent: true,
			opacity: 0.6,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -2,
		}),
	};
}

/**
 * Перфорация стойки: синее поле и каплевидное отверстие. Текстура
 * повторяется по высоте стойки — шаг отверстий около 5 см, как на фото.
 */
function makePerforationTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 64;
	const g = canvas.getContext("2d");
	if (g) {
		g.fillStyle = "#1f4fb8";
		g.fillRect(0, 0, 32, 64);
		g.fillStyle = "#0a1428";
		g.beginPath();
		g.arc(16, 22, 7, Math.PI, 0);
		g.lineTo(16, 44);
		g.closePath();
		g.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(1, 36);
	return texture;
}

/** Мягкое пятно контактной тени: вместо карт теней — дешевле на порядок. */
function makeShadowTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 64;
	const g = canvas.getContext("2d");
	if (g) {
		const gradient = g.createRadialGradient(32, 32, 4, 32, 32, 32);
		gradient.addColorStop(0, "#ffffff");
		gradient.addColorStop(0.55, "#8a8a8a");
		gradient.addColorStop(1, "#000000");
		g.fillStyle = gradient;
		g.fillRect(0, 0, 64, 64);
	}
	return new THREE.CanvasTexture(canvas);
}

/* ========================================================================== */
/* Примитивы                                                                  */
/* ========================================================================== */

type Vec = [number, number, number];

function box(
	parent: THREE.Object3D,
	material: THREE.Material,
	size: Vec,
	position: Vec,
	radius = 0,
) {
	const geometry =
		radius > 0
			? new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius)
			: new THREE.BoxGeometry(size[0], size[1], size[2]);
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(...position);
	parent.add(mesh);
	return mesh;
}

/** Цилиндр, лежащий осью вдоль X (катушки, вентиляторы — по ситуации). */
function cylinder(
	parent: THREE.Object3D,
	material: THREE.Material,
	radius: number,
	length: number,
	position: Vec,
	axis: "x" | "y" | "z" = "y",
	segments = 28,
) {
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry(radius, radius, length, segments),
		material,
	);
	if (axis === "x") mesh.rotation.z = Math.PI / 2;
	if (axis === "z") mesh.rotation.x = Math.PI / 2;
	mesh.position.set(...position);
	parent.add(mesh);
	return mesh;
}

function tube(
	parent: THREE.Object3D,
	material: THREE.Material,
	points: Vec[],
	radius = 0.004,
) {
	const curve = new THREE.CatmullRomCurve3(
		points.map((p) => new THREE.Vector3(...p)),
	);
	const mesh = new THREE.Mesh(
		new THREE.TubeGeometry(curve, 24, radius, 6, false),
		material,
	);
	parent.add(mesh);
	return mesh;
}

function contactShadow(
	parent: THREE.Object3D,
	m: Materials,
	width: number,
	depth: number,
	position: Vec,
) {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m.shadow);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(position[0], position[1] + 0.001, position[2]);
	parent.add(mesh);
	return mesh;
}

/* ========================================================================== */
/* Катушка                                                                    */
/* ========================================================================== */

/** Катушка с прутком, ось — X. Возвращает группу: её вращают целиком. */
function spool(
	m: Materials,
	options: { radius?: number; width?: number; tan?: boolean; empty?: boolean },
) {
	const { radius = 0.1, width = 0.065, tan = false, empty = false } = options;
	const group = new THREE.Group();
	const flange = tan ? m.spoolTan : m.black;
	cylinder(group, flange, radius, 0.006, [-width / 2, 0, 0], "x", 32);
	cylinder(group, flange, radius, 0.006, [width / 2, 0, 0], "x", 32);
	if (!empty) {
		cylinder(
			group,
			tan ? m.filamentLight : m.filament,
			radius * 0.86,
			width - 0.006,
			[0, 0, 0],
			"x",
			32,
		);
	} else {
		cylinder(group, flange, radius * 0.45, width, [0, 0, 0], "x", 20);
	}
	cylinder(
		group,
		m.lightGray,
		radius * 0.28,
		width + 0.012,
		[0, 0, 0],
		"x",
		16,
	);
	return group;
}

/* ========================================================================== */
/* Принтеры                                                                   */
/* ========================================================================== */

/**
 * Движущиеся части одного принтера и их состояние. Движок двигает их
 * каждый кадр, сцена про них больше ничего не знает.
 */
export interface PrinterRig {
	kind: "open" | "enclosed";
	/** Узлы в мировых координатах родителя — двигаются только по своей оси. */
	bed?: THREE.Object3D;
	beam?: THREE.Object3D;
	head: THREE.Object3D;
	/** Детали на столе: растут по Y вместе с печатью. */
	parts: THREE.Object3D;
	spools: THREE.Object3D[];
	/** Готовность печати 0..1 — у «героя» её задаёт прокрутка. */
	progress: number;
	/** Сдвиг фазы, чтобы соседние принтеры не двигались синхронно. */
	phase: number;
	/** Высота деталей на столе, м — от неё зависит подъём головы. */
	partHeight: number;
	/** Точка для камеры: центр стола в мировых координатах. */
	focus: THREE.Vector3;
}

/** Стол принтера, заставленный одинаковыми деталями (как на фото цеха). */
function partsGrid(
	m: Materials,
	columns: number,
	pitch: number,
	shape: "bracket" | "round",
) {
	const pieces: THREE.BufferGeometry[] = [];
	const offset = ((columns - 1) * pitch) / 2;
	for (let i = 0; i < columns; i += 1) {
		for (let j = 0; j < columns; j += 1) {
			const x = i * pitch - offset;
			const z = j * pitch - offset;
			if (shape === "bracket") {
				const base = new RoundedBoxGeometry(0.046, 0.006, 0.046, 1, 0.003);
				base.translate(x, 0.003, z);
				const boss = new THREE.CylinderGeometry(0.009, 0.011, 0.02, 12);
				boss.translate(x, 0.016, z);
				pieces.push(base, boss);
			} else {
				const body = new THREE.CylinderGeometry(0.022, 0.026, 0.03, 18);
				body.translate(x, 0.015, z);
				pieces.push(body);
			}
		}
	}
	const mesh = new THREE.Mesh(mergeClean(pieces), m.part);
	return mesh;
}

/**
 * Открытый принтер с подвижным столом (A1). Начало координат — центр
 * основания на полке, фронт смотрит в +Z.
 *
 * @param feedSide — с какой стороны стоит стойка катушек (+1 справа):
 *   туда уходит жгут трубок с верха арки.
 */
export function buildOpenPrinter(
	m: Materials,
	staticRoot: THREE.Object3D,
	dynamicRoot: THREE.Object3D,
	at: THREE.Vector3,
	options: { feedSide: number; feedDistance: number; animated: boolean },
): PrinterRig {
	const { feedSide, feedDistance, animated } = options;
	const fixed = new THREE.Group();
	fixed.position.copy(at);
	staticRoot.add(fixed);
	const moving = new THREE.Group();
	moving.position.copy(at);
	(animated ? dynamicRoot : staticRoot).add(moving);

	contactShadow(fixed, m, 0.62, 0.62, [0, 0, 0]);
	// Основание и направляющая стола.
	box(fixed, m.white, [0.4, 0.07, 0.42], [0, 0.035, 0], 0.018);
	box(fixed, m.dark, [0.05, 0.012, 0.4], [0, 0.076, 0]);
	// Экран у правого переднего угла — «планшет», откинутый назад.
	const screen = box(
		fixed,
		m.screen,
		[0.105, 0.075, 0.008],
		[0.235, 0.1, 0.165],
		0.003,
	);
	screen.rotation.x = -0.6;
	// Синий лоток для сброса — слева, как на фото.
	box(fixed, m.bin, [0.08, 0.06, 0.1], [-0.25, 0.03, 0.13], 0.006);

	// П-образная арка: две стойки, перекладина, задние подкосы.
	for (const side of [-1, 1]) {
		box(fixed, m.alu, [0.036, 0.42, 0.056], [side * 0.192, 0.28, -0.07], 0.008);
		const strut = box(
			fixed,
			m.dark,
			[0.026, 0.16, 0.036],
			[side * 0.192, 0.13, -0.13],
		);
		strut.rotation.x = -0.45;
	}
	box(fixed, m.alu, [0.42, 0.04, 0.056], [0, 0.49, -0.07], 0.01);

	// Жгут трубок подачи: с верха арки к стойке катушек.
	tube(
		fixed,
		m.lightGray,
		[
			[0, 0.51, -0.07],
			[feedSide * feedDistance * 0.35, 0.62, -0.02],
			[feedSide * feedDistance * 0.8, 0.52, 0.02],
			[feedSide * feedDistance, 0.36, 0.0],
		],
		0.005,
	);

	// Стол с деталями — ездит вдоль Z.
	const bed = new THREE.Group();
	bed.position.y = 0.085;
	moving.add(bed);
	box(bed, m.alu, [0.28, 0.008, 0.29], [0, 0, 0]);
	box(bed, m.plate, [0.27, 0.005, 0.27], [0, 0.006, 0]);
	const parts = partsGrid(m, 4, 0.062, "bracket");
	parts.position.y = 0.009;
	bed.add(parts);

	// Балка оси X — ходит вверх-вниз по стойкам арки.
	const beam = new THREE.Group();
	beam.position.set(0, 0.2, -0.035);
	moving.add(beam);
	box(beam, m.dark, [0.4, 0.034, 0.028], [0, 0, 0], 0.006);
	for (const side of [-1, 1]) {
		box(beam, m.lightGray, [0.056, 0.06, 0.07], [side * 0.192, 0, -0.03], 0.01);
	}

	// Печатающая голова — бегает вдоль балки.
	const head = new THREE.Group();
	head.position.set(0, -0.01, 0.04);
	beam.add(head);
	box(head, m.white, [0.064, 0.08, 0.056], [0, 0, 0], 0.012);
	cylinder(head, m.dark, 0.019, 0.006, [0, 0.005, 0.029], "z", 20);
	box(head, m.dark, [0.012, 0.02, 0.012], [0, -0.048, 0]);
	tube(
		head,
		m.lightGray,
		[
			[0, 0.04, -0.01],
			[0, 0.1, -0.04],
			[0, 0.16, -0.09],
		],
		0.004,
	);

	return {
		kind: "open",
		bed,
		beam,
		head,
		parts,
		spools: [],
		progress: 1,
		phase: 0,
		partHeight: 0.026,
		focus: new THREE.Vector3(at.x, at.y + 0.1, at.z),
	};
}

/**
 * Стойка подачи на четыре катушки (AMS lite): две пары катушек одна над
 * другой, жёлтые фиксаторы у подающих узлов.
 */
export function buildFeeder(
	m: Materials,
	staticRoot: THREE.Object3D,
	dynamicRoot: THREE.Object3D,
	at: THREE.Vector3,
	animated: boolean,
) {
	const fixed = new THREE.Group();
	fixed.position.copy(at);
	staticRoot.add(fixed);

	contactShadow(fixed, m, 0.36, 0.3, [0, 0, 0]);
	box(fixed, m.lightGray, [0.2, 0.02, 0.14], [0, 0.01, 0], 0.008);
	box(fixed, m.white, [0.05, 0.42, 0.06], [0, 0.22, 0], 0.016);

	const spools: THREE.Object3D[] = [];
	for (const y of [0.115, 0.335]) {
		for (const side of [-1, 1]) {
			const s = spool(m, {});
			s.position.set(at.x + side * 0.072, at.y + y, at.z);
			s.rotation.x = side * y * 9;
			(animated ? dynamicRoot : staticRoot).add(s);
			spools.push(s);
			// Подающий узел над катушкой и жёлтый фиксатор.
			cylinder(fixed, m.dark, 0.02, 0.05, [side * 0.06, y + 0.105, 0], "x", 16);
			box(
				fixed,
				m.yellow,
				[0.012, 0.016, 0.02],
				[side * 0.03, y + 0.12, 0.012],
			);
		}
	}
	return spools;
}

/**
 * Закрытый принтер (P1S-подобный): серый корпус, стеклянная дверь и крышка,
 * внутри портал CoreXY. Катушка — на правой стенке снаружи.
 */
export function buildEnclosedPrinter(
	m: Materials,
	staticRoot: THREE.Object3D,
	dynamicRoot: THREE.Object3D,
	at: THREE.Vector3,
	animated: boolean,
): PrinterRig {
	const fixed = new THREE.Group();
	fixed.position.copy(at);
	staticRoot.add(fixed);
	const moving = new THREE.Group();
	moving.position.copy(at);
	(animated ? dynamicRoot : staticRoot).add(moving);

	const W = 0.39;
	const H = 0.46;
	const D = 0.41;

	contactShadow(fixed, m, 0.6, 0.6, [0, 0, 0]);
	// Корпус: основание, стенки, верхняя рамка, стойки двери.
	box(fixed, m.enclosure, [W, 0.08, D], [0, 0.04, 0], 0.012);
	for (const side of [-1, 1]) {
		box(
			fixed,
			m.enclosure,
			[0.016, H - 0.08, D],
			[side * (W / 2 - 0.008), 0.08 + (H - 0.08) / 2, 0],
		);
	}
	box(
		fixed,
		m.enclosure,
		[W, H - 0.08, 0.016],
		[0, 0.08 + (H - 0.08) / 2, -D / 2 + 0.008],
	);
	box(fixed, m.enclosure, [W, 0.026, D], [0, H - 0.013, 0], 0.008);
	// Тёмная внутренность — стекло читается только на тёмном фоне.
	box(
		fixed,
		m.interior,
		[W - 0.034, H - 0.12, 0.004],
		[0, 0.08 + (H - 0.12) / 2, -D / 2 + 0.018],
	);
	box(fixed, m.interior, [W - 0.034, 0.004, D - 0.03], [0, 0.082, 0]);
	// Подсветка камеры — полоса под крышкой.
	box(
		fixed,
		m.chamberLight,
		[W - 0.08, 0.005, 0.012],
		[0, H - 0.03, D / 2 - 0.05],
	);
	// Экран на основании справа и ручка двери.
	box(fixed, m.screen, [0.075, 0.032, 0.004], [0.12, 0.045, D / 2 + 0.001]);
	box(
		fixed,
		m.dark,
		[0.008, 0.08, 0.012],
		[W / 2 - 0.03, 0.27, D / 2 + 0.01],
		0.003,
	);
	// Стекло двери и крышки.
	box(
		fixed,
		m.glass,
		[W - 0.03, H - 0.11, 0.005],
		[0, 0.08 + (H - 0.11) / 2, D / 2 - 0.002],
	);
	box(fixed, m.glass, [W - 0.04, 0.005, D - 0.04], [0, H + 0.002, 0]);
	// Направляющие портала по бокам.
	for (const side of [-1, 1]) {
		box(fixed, m.dark, [0.016, 0.016, D - 0.06], [side * 0.165, H - 0.07, 0]);
	}

	// Катушка на правой стенке и трубка в корпус.
	const sideSpool = spool(m, { tan: true });
	sideSpool.position.set(at.x + W / 2 + 0.045, at.y + 0.27, at.z - 0.06);
	(animated ? dynamicRoot : staticRoot).add(sideSpool);
	cylinder(fixed, m.dark, 0.012, 0.05, [W / 2 + 0.02, 0.27, -0.06], "x", 12);
	tube(
		fixed,
		m.lightGray,
		[
			[W / 2 + 0.04, 0.38, -0.06],
			[W / 2 + 0.02, 0.47, -0.12],
			[W / 2 - 0.04, 0.5, -0.16],
		],
		0.004,
	);

	// Стол с деталями (опускается по мере печати — здесь неподвижен).
	const bed = new THREE.Group();
	bed.position.y = 0.13;
	moving.add(bed);
	box(bed, m.plate, [0.27, 0.008, 0.27], [0, 0, 0]);
	const parts = partsGrid(m, 3, 0.075, "round");
	parts.position.y = 0.004;
	bed.add(parts);

	// Портал CoreXY: поперечина ездит по Z, голова по X.
	const beam = new THREE.Group();
	beam.position.set(0, H - 0.07, 0);
	moving.add(beam);
	box(beam, m.dark, [0.33, 0.018, 0.022], [0, 0, 0], 0.004);
	const head = new THREE.Group();
	head.position.set(0, -0.03, 0.02);
	beam.add(head);
	box(head, m.lightGray, [0.06, 0.07, 0.055], [0, 0, 0], 0.01);
	box(head, m.dark, [0.01, 0.02, 0.01], [0, -0.044, 0]);

	return {
		kind: "enclosed",
		bed,
		beam,
		head,
		parts,
		spools: [sideSpool],
		progress: 1,
		phase: 0,
		partHeight: 0.03,
		focus: new THREE.Vector3(at.x, at.y + 0.22, at.z),
	};
}

/* ========================================================================== */
/* Стеллаж и окружение                                                        */
/* ========================================================================== */

export const RACK = {
	width: 1.8,
	depth: 0.62,
	height: 1.95,
	/** Верх фанеры каждой полки, м. */
	decks: [0.16, 0.84, 1.52],
} as const;

/** Стеллаж: синие стойки с перфорацией, оранжевые балки, фанера. */
export function buildRack(
	m: Materials,
	root: THREE.Object3D,
	at: THREE.Vector3,
) {
	const group = new THREE.Group();
	group.position.copy(at);
	root.add(group);
	const { width: W, depth: D, height: H, decks } = RACK;

	contactShadow(group, m, W + 0.5, D + 0.5, [0, 0, 0]);
	for (const x of [-1, 1]) {
		for (const z of [-1, 1]) {
			box(
				group,
				m.upright,
				[0.045, H, 0.045],
				[(x * W) / 2, H / 2, (z * D) / 2],
			);
		}
	}
	for (const level of decks) {
		for (const z of [-1, 1]) {
			box(group, m.beam, [W, 0.06, 0.032], [0, level - 0.03, (z * D) / 2]);
		}
		for (const x of [-1, 1]) {
			box(group, m.beam, [0.032, 0.045, D], [(x * W) / 2, level - 0.025, 0]);
		}
		box(group, m.plywood, [W - 0.03, 0.018, D - 0.02], [0, level - 0.009, 0]);
	}
	return group;
}

/** Картонная коробка из-под принтера — на полу и на верхних полках. */
export function buildCarton(
	m: Materials,
	root: THREE.Object3D,
	at: THREE.Vector3,
	size: Vec,
	rotation = 0,
) {
	const group = new THREE.Group();
	group.position.copy(at);
	group.rotation.y = rotation;
	root.add(group);
	contactShadow(group, m, size[0] + 0.2, size[2] + 0.2, [0, 0, 0]);
	box(group, m.cardboard, size, [0, size[1] / 2, 0], 0.006);
	box(group, m.tape, [size[0] + 0.002, 0.004, 0.05], [0, size[1] + 0.001, 0]);
	return group;
}

export function buildEmptySpools(
	m: Materials,
	root: THREE.Object3D,
	at: THREE.Vector3,
	count: number,
) {
	for (let i = 0; i < count; i += 1) {
		const s = spool(m, { empty: true });
		s.position.set(at.x + i * 0.085, at.y + 0.1, at.z + (i % 2) * 0.05);
		s.rotation.x = i * 0.7;
		root.add(s);
	}
}

/** Пол, задняя стена с окнами и световые панели под потолком. */
export function buildRoom(m: Materials, root: THREE.Object3D) {
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), m.floor);
	floor.rotation.x = -Math.PI / 2;
	root.add(floor);

	const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), m.wall);
	wall.position.set(0, 4, -3.4);
	root.add(wall);
	for (let i = -3; i <= 4; i += 1) {
		box(root, m.window, [1.1, 1.5, 0.02], [i * 1.6 + 0.4, 1.85, -3.38]);
	}
	for (let i = -2; i <= 3; i += 1) {
		box(root, m.ledPanel, [0.9, 0.02, 0.24], [i * 1.9 + 0.5, 3.2, 0.9]);
		box(root, m.ledPanel, [0.9, 0.02, 0.24], [i * 1.9 + 0.5, 3.2, -1.6]);
	}
}

/* ========================================================================== */
/* Запекание статики                                                          */
/* ========================================================================== */

/** Слить геометрии: без индексов и только с position/normal/uv. */
function mergeClean(geometries: THREE.BufferGeometry[]) {
	const prepared = geometries.map((source) => {
		const g = source.index ? source.toNonIndexed() : source;
		for (const name of Object.keys(g.attributes)) {
			if (name !== "position" && name !== "normal" && name !== "uv")
				g.deleteAttribute(name);
		}
		return g;
	});
	const merged = mergeGeometries(prepared, false);
	for (const g of [...geometries, ...prepared]) g.dispose();
	if (!merged) throw new Error("print-scene: mergeGeometries failed");
	return merged;
}

/**
 * Свести всё неподвижное в один меш на материал. Узлы исходного дерева
 * после этого не нужны и освобождаются.
 */
export function bakeStatic(source: THREE.Object3D) {
	source.updateMatrixWorld(true);
	const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
	source.traverse((node) => {
		if (!(node instanceof THREE.Mesh)) return;
		const geometry = (node.geometry as THREE.BufferGeometry).clone();
		geometry.applyMatrix4(node.matrixWorld);
		const material = node.material as THREE.Material;
		const list = byMaterial.get(material) ?? [];
		list.push(geometry);
		byMaterial.set(material, list);
		node.geometry.dispose();
	});
	const baked = new THREE.Group();
	for (const [material, list] of byMaterial) {
		const mesh = new THREE.Mesh(mergeClean(list), material);
		mesh.matrixAutoUpdate = false;
		mesh.receiveShadow = !material.transparent;
		mesh.castShadow = !material.transparent;
		// Прозрачное (стекло, тени) рисуется после непрозрачного и само по
		// себе; порядок внутри одного слитого меша не важен.
		baked.add(mesh);
	}
	return baked;
}
