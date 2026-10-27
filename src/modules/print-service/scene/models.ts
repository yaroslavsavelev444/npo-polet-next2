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
		steel: std(0xd7dce2, 0.22, 0.9),
		brass: std(0xc9963a, 0.3, 0.9),
		belt: std(0x0e0f11, 0.7),
		ptfe: std(0xe3e6ea, 0.35),
		headDark: std(0x2a2d32, 0.45, 0.15),
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

/**
 * Гибкая трубка подачи, которая следует за головой. Геометрия создаётся
 * один раз, на каждом кадре переписываются только координаты вершин
 * (~150 вершин) — без пересоздания TubeGeometry и мусора для GC. Рамки
 * сечения переносятся вдоль кривой (parallel transport), поэтому трубка не
 * перекручивается, когда голова идёт из стороны в сторону.
 */
export class FlexTube {
	readonly mesh: THREE.Mesh;
	private readonly curve = new THREE.CatmullRomCurve3();
	private readonly radius: number;
	private readonly segments: number;
	private readonly radial = 6;
	private readonly positions: Float32Array;
	private readonly normals: Float32Array;

	constructor(material: THREE.Material, radius: number, segments = 22) {
		this.radius = radius;
		this.segments = segments;
		const ring = this.radial + 1;
		const count = (segments + 1) * ring;
		this.positions = new Float32Array(count * 3);
		this.normals = new Float32Array(count * 3);
		const uvs = new Float32Array(count * 2);
		const index: number[] = [];
		for (let i = 0; i <= segments; i += 1) {
			for (let j = 0; j <= this.radial; j += 1) {
				uvs[(i * ring + j) * 2] = i / segments;
				uvs[(i * ring + j) * 2 + 1] = j / this.radial;
				if (i < segments && j < this.radial) {
					const a = i * ring + j;
					const b = a + ring;
					index.push(a, b, a + 1, b, b + 1, a + 1);
				}
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(this.positions, 3),
		);
		geometry.setAttribute("normal", new THREE.BufferAttribute(this.normals, 3));
		geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
		geometry.setIndex(index);
		this.mesh = new THREE.Mesh(geometry, material);
		// Границы меняются каждый кадр — проверять их дороже, чем нарисовать.
		this.mesh.frustumCulled = false;
		this.mesh.receiveShadow = true;
	}

	/** Провести трубку через точки (мировые координаты). */
	update(points: THREE.Vector3[]) {
		this.curve.points = points;
		const point = FlexTube.p;
		const tangent = FlexTube.t;
		const normal = FlexTube.n;
		const binormal = FlexTube.b;
		const ring = this.radial + 1;
		for (let i = 0; i <= this.segments; i += 1) {
			const u = i / this.segments;
			this.curve.getPoint(u, point);
			this.curve.getTangent(u, tangent);
			if (i === 0) {
				// Начальная нормаль — любой перпендикуляр к касательной.
				normal.set(0, 1, 0);
				if (Math.abs(tangent.y) > 0.9) normal.set(1, 0, 0);
			}
			normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
			binormal.crossVectors(tangent, normal);
			for (let j = 0; j <= this.radial; j += 1) {
				const angle = (j / this.radial) * Math.PI * 2;
				const c = Math.cos(angle);
				const s = Math.sin(angle);
				const k = (i * ring + j) * 3;
				const nx = normal.x * c + binormal.x * s;
				const ny = normal.y * c + binormal.y * s;
				const nz = normal.z * c + binormal.z * s;
				this.normals[k] = nx;
				this.normals[k + 1] = ny;
				this.normals[k + 2] = nz;
				this.positions[k] = point.x + nx * this.radius;
				this.positions[k + 1] = point.y + ny * this.radius;
				this.positions[k + 2] = point.z + nz * this.radius;
			}
		}
		const geometry = this.mesh.geometry;
		geometry.attributes.position.needsUpdate = true;
		geometry.attributes.normal.needsUpdate = true;
	}

	private static p = new THREE.Vector3();
	private static t = new THREE.Vector3();
	private static n = new THREE.Vector3();
	private static b = new THREE.Vector3();
}

/**
 * Слить меши-детали узла в один меш на материал (в координатах узла).
 * Подвижный узел из десятка деталей стоит тогда 2–4 вызова отрисовки.
 * Вложенные группы и меши с userData.keep (детали на столе — их
 * масштабирует печать) остаются как есть.
 */
function compact(group: THREE.Object3D) {
	const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
	for (const child of [...group.children]) {
		if (!(child instanceof THREE.Mesh) || child.userData.keep) continue;
		child.updateMatrix();
		const geometry = (child.geometry as THREE.BufferGeometry).clone();
		geometry.applyMatrix4(child.matrix);
		const material = child.material as THREE.Material;
		const list = byMaterial.get(material) ?? [];
		list.push(geometry);
		byMaterial.set(material, list);
		group.remove(child);
		child.geometry.dispose();
	}
	for (const [material, list] of byMaterial) {
		group.add(new THREE.Mesh(mergeClean(list), material));
	}
	return group;
}

/** Конус сопла: латунь, остриём вниз. */
function nozzle(parent: THREE.Object3D, m: Materials, position: Vec) {
	const mesh = new THREE.Mesh(
		new THREE.CylinderGeometry(0.0015, 0.0055, 0.012, 10),
		m.brass,
	);
	mesh.position.set(...position);
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
	return compact(group);
}

/* ========================================================================== */
/* Принтеры                                                                   */
/* ========================================================================== */

/**
 * Трубка подачи от неподвижного вывода (хаб, проходник в корпусе) к входу
 * печатающей головы. Перестраивается вместе с позой принтера.
 */
export interface FeedLine {
	tube: FlexTube;
	/** Вывод трубки, мировые координаты. */
	from: THREE.Vector3;
	/** Куда трубка уходит из вывода — первый изгиб петли. */
	lead: THREE.Vector3;
	/** Вход в голову, координаты головы. */
	inlet: THREE.Vector3;
	/** Насколько петля поднимается над головой перед входом. */
	rise: number;
}

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
	feed: FeedLine;
	/** Входы хаба на верху арки (открытый принтер) — сюда идут трубки стойки. */
	hubInlets: THREE.Vector3[];
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
	mesh.userData.keep = true;
	return mesh;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Открытый принтер с подвижным столом (A1). Начало координат — центр
 * основания на полке, фронт смотрит в +Z.
 *
 * Путь прутка как у настоящего: четыре трубки от стойки катушек приходят в
 * хаб на перекладине арки, из хаба одна трубка петлёй спускается во вход
 * печатающей головы и следует за ней.
 */
export function buildOpenPrinter(
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
	const motionRoot = animated ? dynamicRoot : staticRoot;
	motionRoot.add(moving);

	contactShadow(fixed, m, 0.62, 0.62, [0, 0, 0]);

	// Основание: корпус, тёмная полоса спереди, направляющая стола.
	box(fixed, m.white, [0.4, 0.07, 0.42], [0, 0.035, 0], 0.018);
	box(fixed, m.headDark, [0.28, 0.016, 0.004], [-0.04, 0.036, 0.211]);
	box(fixed, m.dark, [0.05, 0.012, 0.4], [0, 0.076, 0]);
	box(fixed, m.steel, [0.012, 0.004, 0.4], [-0.015, 0.084, 0]);
	box(fixed, m.steel, [0.012, 0.004, 0.4], [0.015, 0.084, 0]);
	// Экран у правого переднего угла — «планшет», откинутый назад.
	const screen = box(
		fixed,
		m.screen,
		[0.105, 0.075, 0.008],
		[0.235, 0.1, 0.165],
		0.003,
	);
	screen.rotation.x = -0.6;
	const bezel = box(
		fixed,
		m.white,
		[0.115, 0.085, 0.006],
		[0.235, 0.098, 0.162],
	);
	bezel.rotation.x = -0.6;
	// Синий лоток для сброса — слева, как на фото.
	box(fixed, m.bin, [0.07, 0.06, 0.1], [-0.24, 0.03, 0.13], 0.006);

	// П-образная арка: стойки с двигателями Z и винтами, перекладина, подкосы.
	for (const side of [-1, 1]) {
		const x = side * 0.192;
		box(fixed, m.alu, [0.036, 0.42, 0.056], [x, 0.28, -0.07], 0.008);
		box(fixed, m.headDark, [0.05, 0.05, 0.07], [x, 0.095, -0.07], 0.008);
		cylinder(fixed, m.steel, 0.004, 0.36, [x, 0.3, -0.036], "y", 8);
		const strut = box(fixed, m.dark, [0.026, 0.16, 0.036], [x, 0.13, -0.13]);
		strut.rotation.x = -0.45;
	}
	box(fixed, m.alu, [0.42, 0.04, 0.056], [0, 0.49, -0.07], 0.01);
	// Хаб на перекладине: четыре входа сверху, выход к голове спереди.
	box(fixed, m.headDark, [0.07, 0.026, 0.044], [0, 0.523, -0.07], 0.006);
	const hubInlets: THREE.Vector3[] = [];
	for (let i = 0; i < 4; i += 1) {
		const x = (i - 1.5) * 0.014;
		cylinder(fixed, m.lightGray, 0.004, 0.012, [x, 0.541, -0.074], "y", 8);
		hubInlets.push(v3(at.x + x, at.y + 0.547, at.z - 0.074));
	}
	cylinder(fixed, m.lightGray, 0.005, 0.014, [0, 0.523, -0.042], "z", 8);

	// Стол с деталями — ездит вдоль Z.
	const bed = new THREE.Group();
	bed.position.y = 0.085;
	moving.add(bed);
	box(bed, m.alu, [0.28, 0.008, 0.29], [0, 0, 0]);
	box(bed, m.plate, [0.27, 0.005, 0.27], [0, 0.006, 0]);
	box(bed, m.headDark, [0.06, 0.012, 0.016], [0, 0, 0.152]);
	const parts = partsGrid(m, 4, 0.062, "bracket");
	parts.position.y = 0.009;
	bed.add(parts);
	compact(bed);

	// Балка оси X: рельс и ремень спереди, каретки на винтах стоек.
	const beam = new THREE.Group();
	beam.position.set(0, 0.2, -0.035);
	moving.add(beam);
	box(beam, m.dark, [0.4, 0.034, 0.028], [0, 0, 0], 0.006);
	box(beam, m.steel, [0.36, 0.007, 0.006], [0, 0.009, 0.016]);
	box(beam, m.belt, [0.36, 0.006, 0.003], [0, -0.008, 0.0155]);
	for (const side of [-1, 1]) {
		box(beam, m.lightGray, [0.056, 0.06, 0.07], [side * 0.192, 0, -0.03], 0.01);
	}
	compact(beam);

	// Печатающая голова: корпус, вентилятор спереди, боковой обдув, нагреватель
	// и латунное сопло снизу, рычаг резака и вход трубки сверху.
	const head = new THREE.Group();
	head.position.set(0, -0.01, 0.04);
	beam.add(head);
	box(head, m.white, [0.064, 0.08, 0.056], [0, 0, 0], 0.012);
	cylinder(head, m.headDark, 0.02, 0.005, [0, 0.008, 0.029], "z", 24);
	cylinder(head, m.lightGray, 0.007, 0.007, [0, 0.008, 0.031], "z", 12);
	cylinder(head, m.headDark, 0.013, 0.006, [-0.034, -0.01, 0.004], "x", 16);
	box(head, m.headDark, [0.04, 0.012, 0.03], [0, -0.046, 0]);
	box(head, m.lightGray, [0.016, 0.01, 0.012], [0.02, 0.042, 0.012], 0.003);
	cylinder(head, m.headDark, 0.006, 0.01, [0, 0.044, -0.008], "y", 10);
	nozzle(head, m, [0, -0.058, 0]);
	compact(head);

	// Петля трубки «хаб → голова».
	const feedTube = new FlexTube(m.ptfe, 0.0035);
	motionRoot.add(feedTube.mesh);

	return {
		kind: "open",
		bed,
		beam,
		head,
		parts,
		spools: [],
		feed: {
			tube: feedTube,
			from: v3(at.x, at.y + 0.523, at.z - 0.035),
			lead: v3(0, 0.08, 0.05),
			inlet: v3(0, 0.05, -0.008),
			rise: 0.11,
		},
		hubInlets,
		progress: 1,
		phase: 0,
		partHeight: 0.026,
		focus: new THREE.Vector3(at.x, at.y + 0.1, at.z),
	};
}

/**
 * Стойка подачи на четыре катушки (AMS lite): две пары катушек одна над
 * другой, над каждой — подающий узел с жёлтым фиксатором. Из узлов четыре
 * трубки уходят в хаб принтера (hubInlets).
 */
export function buildFeeder(
	m: Materials,
	staticRoot: THREE.Object3D,
	dynamicRoot: THREE.Object3D,
	at: THREE.Vector3,
	animated: boolean,
	hubInlets: THREE.Vector3[],
) {
	const fixed = new THREE.Group();
	fixed.position.copy(at);
	staticRoot.add(fixed);

	contactShadow(fixed, m, 0.36, 0.3, [0, 0, 0]);
	box(fixed, m.lightGray, [0.2, 0.02, 0.14], [0, 0.01, 0], 0.008);
	for (const x of [-0.08, 0.08]) {
		for (const z of [-0.05, 0.05]) {
			cylinder(fixed, m.headDark, 0.008, 0.004, [x, 0.002, z], "y", 10);
		}
	}
	box(fixed, m.white, [0.05, 0.42, 0.06], [0, 0.22, 0], 0.016);
	box(fixed, m.lightGray, [0.06, 0.03, 0.07], [0, 0.44, 0], 0.01);

	const spools: THREE.Object3D[] = [];
	const outlets: THREE.Vector3[] = [];
	for (const y of [0.115, 0.335]) {
		for (const side of [-1, 1]) {
			const s = spool(m, {});
			s.position.set(at.x + side * 0.072, at.y + y, at.z);
			s.rotation.x = side * y * 9;
			(animated ? dynamicRoot : staticRoot).add(s);
			spools.push(s);
			// Кронштейн катушки от колонны.
			box(fixed, m.lightGray, [0.04, 0.014, 0.02], [side * 0.03, y, 0], 0.004);
			// Подающий узел над катушкой, жёлтый фиксатор и выход трубки.
			cylinder(fixed, m.dark, 0.02, 0.05, [side * 0.06, y + 0.105, 0], "x", 16);
			box(
				fixed,
				m.yellow,
				[0.012, 0.016, 0.02],
				[side * 0.03, y + 0.12, 0.012],
			);
			cylinder(
				fixed,
				m.lightGray,
				0.004,
				0.012,
				[side * 0.06, y + 0.128, 0],
				"y",
				8,
			);
			outlets.push(v3(at.x + side * 0.06, at.y + y + 0.134, at.z));
		}
	}

	// Четыре трубки к хабу: вверх из узла, дугой над полкой, вниз во вход.
	outlets.sort((a, b) => a.x - b.x || a.y - b.y);
	const inlets = [...hubInlets].sort((a, b) => a.x - b.x);
	outlets.forEach((outlet, i) => {
		const inlet = inlets[i % inlets.length];
		const top = Math.max(outlet.y, inlet.y) + 0.09 + i * 0.008;
		tube(
			staticRoot,
			m.ptfe,
			[
				[outlet.x, outlet.y, outlet.z],
				[outlet.x, outlet.y + 0.05, outlet.z + (i - 1.5) * 0.004],
				[at.x + (outlet.x - at.x) * 0.3, top - 0.03, at.z - 0.01],
				[(at.x + inlet.x) / 2, top, (at.z + inlet.z) / 2],
				[inlet.x, inlet.y + 0.05, inlet.z],
				[inlet.x, inlet.y, inlet.z],
			],
			0.0032,
		);
	});
	return spools;
}

/**
 * Закрытый принтер (P1S-подобный): серый корпус, дверь в рамке со стеклом,
 * внутри портал CoreXY на угольных трубах и стол на трёх винтах. Катушка —
 * на правой стенке снаружи, трубка от неё входит в проходник на крыше, а
 * изнутри петлёй идёт в голову.
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
	const motionRoot = animated ? dynamicRoot : staticRoot;
	motionRoot.add(moving);

	const W = 0.39;
	const H = 0.46;
	const D = 0.41;

	contactShadow(fixed, m, 0.6, 0.6, [0, 0, 0]);
	// Корпус: основание, стенки, крыша.
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
	// Вытяжной вентилятор на задней стенке.
	cylinder(
		fixed,
		m.headDark,
		0.035,
		0.008,
		[0.08, 0.3, -D / 2 + 0.024],
		"z",
		24,
	);
	cylinder(fixed, m.dark, 0.012, 0.01, [0.08, 0.3, -D / 2 + 0.026], "z", 12);
	// Подсветка камеры — полоса под крышей.
	box(
		fixed,
		m.chamberLight,
		[W - 0.08, 0.005, 0.012],
		[0, H - 0.03, D / 2 - 0.05],
	);
	// Экран на основании и тёмная полоса под дверью.
	box(fixed, m.headDark, [W - 0.04, 0.03, 0.003], [0, 0.045, D / 2 + 0.0005]);
	box(fixed, m.screen, [0.075, 0.022, 0.003], [0.12, 0.045, D / 2 + 0.002]);
	// Дверь: рамка, стекло, петли слева, ручка справа.
	const doorH = H - 0.11;
	const doorY = 0.08 + doorH / 2;
	for (const side of [-1, 1]) {
		box(
			fixed,
			m.headDark,
			[0.014, doorH, 0.008],
			[side * (W / 2 - 0.022), doorY, D / 2 + 0.003],
		);
		box(
			fixed,
			m.headDark,
			[W - 0.03, 0.012, 0.008],
			[0, doorY + (side * doorH) / 2, D / 2 + 0.003],
		);
		box(
			fixed,
			m.steel,
			[0.008, 0.03, 0.008],
			[-W / 2 + 0.012, doorY + side * 0.11, D / 2 + 0.006],
		);
	}
	box(
		fixed,
		m.glass,
		[W - 0.05, doorH - 0.012, 0.004],
		[0, doorY, D / 2 + 0.003],
	);
	box(
		fixed,
		m.steel,
		[0.008, 0.08, 0.012],
		[W / 2 - 0.035, doorY, D / 2 + 0.012],
		0.003,
	);

	// Портал: боковые направляющие со стальными штангами, винты стола.
	for (const side of [-1, 1]) {
		box(fixed, m.dark, [0.016, 0.016, D - 0.06], [side * 0.165, H - 0.07, 0]);
		cylinder(
			fixed,
			m.steel,
			0.003,
			D - 0.07,
			[side * 0.165, H - 0.058, 0],
			"z",
			8,
		);
	}
	for (const [x, z] of [
		[-0.15, -0.15],
		[0.15, -0.15],
		[-0.15, 0.13],
	]) {
		cylinder(
			fixed,
			m.steel,
			0.004,
			H - 0.14,
			[x, 0.08 + (H - 0.14) / 2, z],
			"y",
			8,
		);
	}

	// Катушка на правой стенке, трубка от неё — в проходник на крыше.
	const sideSpool = spool(m, { tan: true });
	sideSpool.position.set(at.x + W / 2 + 0.045, at.y + 0.27, at.z - 0.06);
	(animated ? dynamicRoot : staticRoot).add(sideSpool);
	cylinder(fixed, m.dark, 0.012, 0.05, [W / 2 + 0.02, 0.27, -0.06], "x", 12);
	box(
		fixed,
		m.headDark,
		[0.022, 0.012, 0.022],
		[W / 2 - 0.04, H + 0.006, -D / 2 + 0.04],
		0.004,
	);
	tube(
		fixed,
		m.ptfe,
		[
			[W / 2 + 0.045, 0.372, -0.06],
			[W / 2 + 0.05, 0.43, -0.08],
			[W / 2 + 0.02, H + 0.06, -D / 2 + 0.06],
			[W / 2 - 0.04, H + 0.03, -D / 2 + 0.04],
			[W / 2 - 0.04, H + 0.012, -D / 2 + 0.04],
		],
		0.0035,
	);

	// Стол на раме (опускается по мере печати — здесь неподвижен).
	const bed = new THREE.Group();
	bed.position.y = 0.13;
	moving.add(bed);
	box(bed, m.dark, [0.3, 0.012, 0.32], [0, -0.01, -0.01]);
	box(bed, m.plate, [0.27, 0.006, 0.27], [0, 0, 0]);
	const parts = partsGrid(m, 3, 0.075, "round");
	parts.position.y = 0.003;
	bed.add(parts);
	compact(bed);

	// Портал CoreXY: две угольные трубы с каретками ездят по Z, голова — по X.
	const beam = new THREE.Group();
	beam.position.set(0, H - 0.07, 0);
	moving.add(beam);
	cylinder(beam, m.black, 0.006, 0.31, [0, 0.008, -0.01], "x", 12);
	cylinder(beam, m.black, 0.006, 0.31, [0, -0.008, -0.01], "x", 12);
	for (const side of [-1, 1]) {
		box(beam, m.lightGray, [0.03, 0.03, 0.04], [side * 0.162, 0, -0.01], 0.005);
	}
	compact(beam);
	const head = new THREE.Group();
	head.position.set(0, -0.03, 0.02);
	beam.add(head);
	box(head, m.headDark, [0.06, 0.07, 0.055], [0, 0, 0], 0.01);
	box(head, m.lightGray, [0.05, 0.05, 0.004], [0, 0.004, 0.028], 0.004);
	cylinder(head, m.headDark, 0.014, 0.004, [0, 0.004, 0.031], "z", 20);
	box(head, m.dark, [0.034, 0.01, 0.03], [0, -0.04, 0]);
	cylinder(head, m.lightGray, 0.005, 0.01, [0, 0.038, -0.006], "y", 10);
	nozzle(head, m, [0, -0.051, 0]);
	compact(head);

	// Петля трубки внутри камеры: от проходника под крышей к голове.
	const feedTube = new FlexTube(m.ptfe, 0.0032);
	motionRoot.add(feedTube.mesh);

	return {
		kind: "enclosed",
		bed,
		beam,
		head,
		parts,
		spools: [sideSpool],
		feed: {
			tube: feedTube,
			from: v3(at.x + W / 2 - 0.04, at.y + H - 0.03, at.z - D / 2 + 0.04),
			lead: v3(-0.05, -0.03, 0.06),
			inlet: v3(0, 0.043, -0.006),
			rise: 0.02,
		},
		hubInlets: [],
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
	// Ни одна грань не лежит в плоскости соседней: совпавшие плоскости
	// (раньше — верх фанеры и верх балки на уровне полки) дают z-fighting, и
	// при «дыхании» камеры угол полки мерцал. Фанера лежит МЕЖДУ балками и на
	// 3 мм ниже их кромки, поперечины — ещё ниже фанеры.
	const BEAM = 0.032;
	for (const level of decks) {
		for (const z of [-1, 1]) {
			box(group, m.beam, [W, 0.06, BEAM], [0, level - 0.03, (z * D) / 2]);
		}
		for (const x of [-1, 1]) {
			box(
				group,
				m.beam,
				[BEAM, 0.045, D - BEAM - 0.004],
				[(x * W) / 2, level - 0.03, 0],
			);
		}
		box(
			group,
			m.plywood,
			[W - BEAM - 0.006, 0.016, D - BEAM - 0.004],
			[0, level - 0.003 - 0.008, 0],
		);
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
