/**
 * Процедурные модели изделий и целей.
 *
 * Каждая модель — группа голограмм (см. holo в kit.ts) плюс «якоря»:
 * пустые Object3D в характерных точках (дуло, резьба, разъём), к которым
 * движок цепляет выноски. Размеры — в метрах и близки к реальным, чтобы
 * сцены можно было собирать в одном масштабе.
 *
 * Оси: x — вправо, y — вверх, z — вперёд (по стволу / по курсу).
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
	COLORS,
	glowSprite,
	type HoloStyle,
	hash,
	holo,
	makeEdgeMaterial,
} from "./kit";

/* ========================================================================== */
/* Утилиты геометрии                                                          */
/* ========================================================================== */

function merge(geometries: THREE.BufferGeometry[]) {
	const prepared = geometries.map((g) => {
		const ng = g.index ? g.toNonIndexed() : g;
		for (const name of Object.keys(ng.attributes)) {
			if (name !== "position" && name !== "normal") ng.deleteAttribute(name);
		}
		ng.clearGroups();
		return ng;
	});
	const merged = mergeGeometries(prepared, false);
	return merged ?? new THREE.BufferGeometry();
}

/** Профиль в плоскости (z, y), выдавленный по x на толщину depth. */
function extrudeSide(
	points: Array<[number, number]>,
	depth: number,
	holes: Array<Array<[number, number]>> = [],
	bevel = 0.005,
) {
	const shape = new THREE.Shape(
		points.map(([z, y]) => new THREE.Vector2(z, y)),
	);
	for (const h of holes) {
		shape.holes.push(
			new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))),
		);
	}
	const g = new THREE.ExtrudeGeometry(shape, {
		depth,
		bevelEnabled: bevel > 0,
		bevelThickness: bevel,
		bevelSize: bevel * 0.8,
		bevelSegments: 3,
		curveSegments: 10,
	});
	g.rotateY(-Math.PI / 2);
	g.translate(depth / 2, 0, 0);
	return g;
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
	return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Цилиндр вдоль z. */
function cylZ(
	r: number,
	len: number,
	z0: number,
	x = 0,
	y = 0,
	seg = 24,
	r2 = r,
) {
	return new THREE.CylinderGeometry(r2, r, len, seg, 1)
		.rotateX(Math.PI / 2)
		.translate(x, y, z0 + len / 2);
}

/** Цилиндр вдоль y. */
function cylY(r: number, h: number, x = 0, y = 0, z = 0, seg = 18, r2 = r) {
	return new THREE.CylinderGeometry(r2, r, h, seg, 1).translate(
		x,
		y + h / 2,
		z,
	);
}

function ringZ(r: number, tube: number, z: number, y = 0, x = 0) {
	return new THREE.TorusGeometry(r, tube, 6, 48).translate(x, y, z);
}

function anchor(parent: THREE.Object3D, x: number, y: number, z: number) {
	const a = new THREE.Object3D();
	a.position.set(x, y, z);
	parent.add(a);
	return a;
}

/** Светящийся элемент без френеля: кольца, резьба, провода. */
function glowMesh(
	geometry: THREE.BufferGeometry,
	color: THREE.Color,
	opacity = 1,
) {
	return new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			fog: true,
		}),
	);
}

/* ========================================================================== */
/* Рукоять «Паук»                                                             */
/* ========================================================================== */

const PISTOL_STYLE: HoloStyle = {
	rim: COLORS.cyan,
	base: new THREE.Color(0x061b26),
	edge: COLORS.cyan,
	edgeOpacity: 0.6,
	wire: 0.075,
	rimStrength: 0.95,
	edgeAngle: 35,
};

export interface Pistol {
	group: THREE.Group;
	/** Точки на торцах стволов — сюда накручиваются снаряды. */
	muzzles: THREE.Object3D[];
	trigger: THREE.Object3D;
	grip: THREE.Object3D;
	material: ReturnType<typeof holo>["material"];
}

/** Рукоять: «single» — Паук 30БН, «duplet» — два ствола друг над другом. */
export function makePistol(kind: "single" | "duplet"): Pistol {
	const top = kind === "duplet" ? 0.104 : 0.058;
	const front = 0.078;
	const outline: Array<[number, number]> = [
		[-0.085, top - 0.016],
		[-0.075, top],
		[front - 0.018, top],
		[front, top - 0.01],
		[front, 0.01],
		[front - 0.012, 0],
		[0.05, 0],
		[0.048, -0.03],
		[0.036, -0.044],
		[0.006, -0.044],
		[-0.006, -0.03],
		[-0.018, -0.04],
		[-0.032, -0.12],
		[-0.03, -0.14],
		[-0.072, -0.14],
		[-0.078, -0.122],
		[-0.062, -0.04],
		[-0.07, -0.01],
		[-0.088, 0.012],
		[-0.092, 0.028],
	];
	const guard: Array<[number, number]> = [
		[0.038, -0.007],
		[0.038, -0.03],
		[0.03, -0.037],
		[0.01, -0.037],
		[0.002, -0.024],
		[0.008, -0.007],
	];
	const group = new THREE.Group();
	const barrels = kind === "duplet" ? [0.028, 0.076] : [0.028];
	const parts: THREE.BufferGeometry[] = [
		extrudeSide(outline, 0.034, [guard], 0.006),
	];
	for (const y of barrels) parts.push(cylZ(0.017, 0.036, front, 0, y, 28));
	// Спусковой крючок.
	parts.push(box(0.008, 0.02, 0.008, 0, -0.02, 0.024));
	const body = holo(merge(parts), PISTOL_STYLE);
	group.add(body.group);

	// Резьба на дулах — светящиеся кольца.
	const muzzles: THREE.Object3D[] = [];
	for (const y of barrels) {
		for (let k = 0; k < 4; k += 1) {
			group.add(
				glowMesh(
					ringZ(0.0176, 0.0012, front + 0.012 + k * 0.006, y),
					COLORS.cyan,
					0.9,
				),
			);
		}
		muzzles.push(anchor(group, 0, y, front + 0.036));
		// Яркий огонь над дулом, как на роликах.
		const led = glowSprite(COLORS.white, 0.05);
		led.position.set(0, y + 0.022, front - 0.004);
		group.add(led);
	}
	const tail = glowSprite(COLORS.cyan, 0.035);
	tail.position.set(0, top - 0.008, -0.08);
	group.add(tail);

	return {
		group,
		muzzles,
		trigger: anchor(group, 0, -0.02, 0.024),
		grip: anchor(group, 0, -0.1, -0.05),
		material: body.material,
	};
}

/* ========================================================================== */
/* Снаряд-кассета                                                             */
/* ========================================================================== */

export interface Projectile {
	group: THREE.Group;
	/** Уложенная внутри сеть — видна сквозь корпус. */
	packed: THREE.Group;
	/** Задний торец — точка стыковки с дулом. */
	back: THREE.Object3D;
	front: THREE.Object3D;
	material: ReturnType<typeof holo>["material"];
}

/**
 * Конусная кассета: втулка с резьбой сзади, раструб вперёд. Внутри — сеть,
 * уложенная клубком, и четыре груза у кромки раструба.
 */
export function makeProjectile(scale = 1, rim = COLORS.blue): Projectile {
	const group = new THREE.Group();
	const profile = [
		[0.0, 0],
		[0.02, 0],
		[0.021, 0.03],
		[0.026, 0.036],
		[0.06, 0.152],
		[0.066, 0.156],
		[0.066, 0.168],
		[0.058, 0.17],
	].map(([r, h]) => new THREE.Vector2(r * scale, h * scale));
	const lathe = new THREE.LatheGeometry(profile, 32).rotateX(Math.PI / 2);
	const shell = holo(lathe, {
		rim,
		base: new THREE.Color(0x050b18),
		opacity: 0.72,
		edgeOpacity: 0.35,
		edgeAngle: 40,
		rimStrength: 1.5,
	});
	group.add(shell.group);
	for (const [r, z] of [
		[0.0215, 0.004],
		[0.0215, 0.026],
		[0.067, 0.157],
		[0.067, 0.167],
	]) {
		group.add(glowMesh(ringZ(r * scale, 0.0016 * scale, z * scale), rim, 0.95));
	}
	// Сеть внутри: клубок замкнутых кривых.
	const packed = new THREE.Group();
	const lineMat = new THREE.LineBasicMaterial({
		color: COLORS.net,
		transparent: true,
		opacity: 0.85,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
	for (let k = 0; k < 9; k += 1) {
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= 40; i += 1) {
			const a = (i / 40) * Math.PI * 2;
			const z = 0.05 + 0.09 * ((i / 40 + hash(k) * 0.5) % 1);
			const r =
				(0.016 + 0.6 * (z - 0.036) * 0.3 + 0.008 * Math.sin(a * 3 + k)) * 1.2;
			pts.push(
				new THREE.Vector3(
					Math.cos(a + k) * r * scale,
					Math.sin(a * 2 + k * 0.7) * r * scale,
					z * scale,
				),
			);
		}
		packed.add(
			new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat),
		);
	}
	for (let k = 0; k < 4; k += 1) {
		const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
		const s = glowSprite(COLORS.net, 0.03 * scale);
		s.position.set(
			Math.cos(a) * 0.05 * scale,
			Math.sin(a) * 0.05 * scale,
			0.145 * scale,
		);
		packed.add(s);
	}
	group.add(packed);
	return {
		group,
		packed,
		back: anchor(group, 0, 0, 0),
		front: anchor(group, 0, 0, 0.17 * scale),
		material: shell.material,
	};
}

/* ========================================================================== */
/* Мультикоптеры                                                              */
/* ========================================================================== */

export interface Rotor {
	holder: THREE.Group;
	blades: THREE.Group;
	disc: THREE.Mesh;
	dir: number;
}

export interface Copter {
	group: THREE.Group;
	/** Корпус без винтов — его можно наклонять отдельно. */
	frame: THREE.Group;
	rotors: Rotor[];
	/** speed — доля номинальных оборотов 0..1. */
	spin: (angle: number, speed: number) => void;
}

function makeRotors(
	parent: THREE.Object3D,
	motors: THREE.Vector3[],
	propR: number,
	color: THREE.Color,
	bladeColor: THREE.Color,
): Rotor[] {
	const bladeGeo = new THREE.BoxGeometry(propR * 2, propR * 0.02, propR * 0.16);
	const bladeMat = new THREE.MeshBasicMaterial({
		color: bladeColor,
		transparent: true,
		opacity: 0.9,
		fog: true,
	});
	const discGeo = new THREE.CircleGeometry(propR, 40).rotateX(-Math.PI / 2);
	return motors.map((m, i) => {
		const holder = new THREE.Group();
		holder.position.copy(m);
		const blades = new THREE.Group();
		const b1 = new THREE.Mesh(bladeGeo, bladeMat.clone());
		blades.add(b1);
		const disc = new THREE.Mesh(
			discGeo,
			new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.16,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				side: THREE.DoubleSide,
				fog: true,
			}),
		);
		const rimLine = new THREE.LineLoop(
			new THREE.BufferGeometry().setFromPoints(
				Array.from({ length: 48 }, (_, k) => {
					const a = (k / 48) * Math.PI * 2;
					return new THREE.Vector3(Math.cos(a) * propR, 0, Math.sin(a) * propR);
				}),
			),
			makeEdgeMaterial(color, 0.35),
		);
		disc.add(rimLine);
		holder.add(blades, disc);
		parent.add(holder);
		return { holder, blades, disc, dir: i % 2 === 0 ? 1 : -1 };
	});
}

function spinner(rotors: Rotor[]) {
	return (angle: number, speed: number) => {
		for (const r of rotors) {
			r.blades.rotation.y = angle * r.dir + r.dir * 0.7;
			const dm = r.disc.material as THREE.MeshBasicMaterial;
			dm.opacity = 0.16 * speed;
			r.disc.visible = speed > 0.02;
			(r.disc.children[0] as THREE.LineLoop).visible = speed > 0.02;
			const bm = (r.blades.children[0] as THREE.Mesh)
				.material as THREE.MeshBasicMaterial;
			bm.opacity = THREE.MathUtils.lerp(0.95, 0.25, speed);
		}
	};
}

/** Х-рама: лучи, моторы, стек. Общая основа FPV-дронов. */
function xFrame(opts: {
	arm: number;
	body: [number, number, number];
	motorR: number;
	propR: number;
	style: HoloStyle;
	disc: THREE.Color;
	blade: THREE.Color;
	armWidth?: number;
}): Copter & { top: number } {
	const group = new THREE.Group();
	const frame = new THREE.Group();
	group.add(frame);
	const [bw, bh, bd] = opts.body;
	const aw = opts.armWidth ?? opts.arm * 0.12;
	const parts: THREE.BufferGeometry[] = [
		new RoundedBoxGeometry(bw, bh, bd, 2, Math.min(bw, bh) * 0.18),
	];
	const motors: THREE.Vector3[] = [];
	for (const [sx, sz] of [
		[1, 1],
		[-1, 1],
		[-1, -1],
		[1, -1],
	]) {
		const mx = (sx * opts.arm) / Math.SQRT2;
		const mz = (sz * opts.arm) / Math.SQRT2;
		const arm = new THREE.BoxGeometry(opts.arm, aw * 0.35, aw)
			.translate(opts.arm / 2, 0, 0)
			.rotateY(-Math.atan2(mz, mx));
		parts.push(arm);
		parts.push(
			cylY(opts.motorR, opts.motorR * 1.1, mx, -opts.motorR * 0.2, mz, 16),
		);
		motors.push(new THREE.Vector3(mx, opts.motorR * 1.0, mz));
	}
	const body = holo(merge(parts), opts.style);
	frame.add(body.group);
	const rotors = makeRotors(group, motors, opts.propR, opts.disc, opts.blade);
	return { group, frame, rotors, spin: spinner(rotors), top: bh / 2 };
}

const DRONE_STYLE: HoloStyle = {
	rim: COLORS.blue,
	base: new THREE.Color(0x0a1426),
	edge: COLORS.blue,
	edgeOpacity: 0.9,
	rimStrength: 1.1,
	edgeAngle: 30,
};

const TARGET_STYLE: HoloStyle = {
	rim: COLORS.silver,
	base: new THREE.Color(0x1a2130),
	edge: COLORS.silver,
	edgeOpacity: 0.8,
	rimStrength: 1.2,
};

/** Дрон-цель: белая FPV-«ударка» с подвесом под брюхом и красным огнём. */
export function makeTargetDrone(): Copter & { led: THREE.Sprite } {
	const c = xFrame({
		arm: 0.16,
		body: [0.06, 0.035, 0.12],
		motorR: 0.016,
		propR: 0.065,
		style: TARGET_STYLE,
		disc: COLORS.silver,
		blade: new THREE.Color(0x9aa7bb),
	});
	const payload = holo(cylZ(0.022, 0.12, -0.04, 0, -0.04, 14), {
		...TARGET_STYLE,
		rim: new THREE.Color(0xd9a08a),
	});
	c.frame.add(payload.group);
	const led = glowSprite(COLORS.red, 0.09);
	led.position.set(0, 0.03, -0.07);
	c.group.add(led);
	return { ...c, led };
}

/* ---- Сеткомёт FPV ------------------------------------------------------- */

export interface FpvInterceptor extends Copter {
	/** Пусковое устройство: площадка, трубка, плата. */
	launcher: THREE.Group;
	screws: THREE.Object3D[];
	/** Торец трубки — сюда накручивается снаряд. */
	socket: THREE.Object3D;
	board: THREE.Object3D;
	wire: THREE.Mesh;
	projectile: Projectile;
}

export function makeFpvInterceptor(): FpvInterceptor {
	const c = xFrame({
		arm: 0.2,
		body: [0.07, 0.04, 0.15],
		motorR: 0.02,
		propR: 0.09,
		style: DRONE_STYLE,
		disc: COLORS.blue,
		blade: new THREE.Color(0x2a3d63),
	});
	// Камера на носу.
	const cam = holo(box(0.03, 0.03, 0.025, 0, 0.005, 0.085), DRONE_STYLE);
	c.frame.add(cam.group);
	const lens = glowSprite(COLORS.cyan, 0.03);
	lens.position.set(0, 0.005, 0.1);
	c.frame.add(lens);

	const launcher = new THREE.Group();
	launcher.position.set(0, 0.02, 0.0);
	const plate = holo(
		merge([
			box(0.06, 0.006, 0.08, 0, 0.003, 0),
			cylZ(0.019, 0.07, 0.0, 0, 0.026, 24),
			box(0.02, 0.016, 0.03, 0, 0.012, -0.01),
		]),
		{ ...DRONE_STYLE, rim: COLORS.cyan, edge: COLORS.cyan },
	);
	launcher.add(plate.group);
	launcher.add(glowMesh(ringZ(0.0195, 0.0016, 0.068, 0.026), COLORS.cyan));
	launcher.add(glowMesh(ringZ(0.0195, 0.0016, 0.06, 0.026), COLORS.cyan, 0.6));
	const screws: THREE.Object3D[] = [];
	for (const [x, z] of [
		[0.024, 0.032],
		[-0.024, 0.032],
		[-0.024, -0.032],
		[0.024, -0.032],
	]) {
		const s = glowSprite(COLORS.cyan, 0.018);
		s.position.set(x, 0.008, z);
		launcher.add(s);
		screws.push(s);
	}
	// Плата инициации с зелёным огнём.
	const boardHolo = holo(box(0.03, 0.004, 0.024, 0, 0.0, -0.05), {
		...DRONE_STYLE,
		rim: COLORS.green,
		edge: COLORS.green,
	});
	launcher.add(boardHolo.group);
	const boardLed = glowSprite(COLORS.green, 0.022);
	boardLed.position.set(0.008, 0.006, -0.05);
	launcher.add(boardLed);
	const board = anchor(launcher, 0, 0.004, -0.05);
	c.group.add(launcher);
	// Провод от платы к полётному контроллеру.
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(-0.01, 0.02, -0.05),
		new THREE.Vector3(-0.03, 0.03, -0.07),
		new THREE.Vector3(-0.03, 0.0, -0.06),
		new THREE.Vector3(-0.015, -0.01, -0.03),
	]);
	const wire = glowMesh(
		new THREE.TubeGeometry(curve, 24, 0.0018, 5),
		COLORS.red,
		0.9,
	);
	c.group.add(wire);

	const projectile = makeProjectile(0.62, COLORS.blue);
	c.group.add(projectile.group);
	const socket = anchor(launcher, 0, 0.026, 0.07);
	return { ...c, launcher, screws, socket, board, wire, projectile };
}

/* ---- Mavic + сеткомёт ---------------------------------------------------- */

export interface Mavic extends Copter {
	mount: THREE.Group;
	band: THREE.Mesh;
	launcher: THREE.Group;
	socket: THREE.Object3D;
	photodiode: THREE.Sprite;
	plug: THREE.Mesh;
	weights: THREE.Group;
	/** Нижняя кромка сеткомёта — отсюда вылетает сеть. */
	mouth: THREE.Object3D;
}

export function makeMavic(): Mavic {
	const group = new THREE.Group();
	const frame = new THREE.Group();
	group.add(frame);
	const style: HoloStyle = { ...DRONE_STYLE, edgeOpacity: 0.7 };
	const parts: THREE.BufferGeometry[] = [
		new RoundedBoxGeometry(0.095, 0.075, 0.24, 3, 0.022),
		// Батарея сверху.
		new RoundedBoxGeometry(0.075, 0.03, 0.15, 2, 0.01).translate(
			0,
			0.045,
			-0.03,
		),
	];
	const motors: THREE.Vector3[] = [];
	// Передние лучи выходят вбок-вперёд на уровне верха, задние — ниже и назад.
	for (const [sx, front] of [
		[1, true],
		[-1, true],
		[1, false],
		[-1, false],
	] as const) {
		const from = new THREE.Vector3(
			sx * 0.045,
			front ? 0.02 : -0.02,
			front ? 0.07 : -0.08,
		);
		const to = new THREE.Vector3(
			sx * 0.16,
			front ? 0.03 : 0.0,
			front ? 0.13 : -0.12,
		);
		const len = from.distanceTo(to);
		const arm = new THREE.BoxGeometry(0.018, 0.016, len);
		const mid = from.clone().add(to).multiplyScalar(0.5);
		const dir = to.clone().sub(from).normalize();
		const q = new THREE.Quaternion().setFromUnitVectors(
			new THREE.Vector3(0, 0, 1),
			dir,
		);
		arm.applyQuaternion(q).translate(mid.x, mid.y, mid.z);
		parts.push(arm);
		parts.push(cylY(0.016, 0.022, to.x, to.y - 0.008, to.z, 14));
		motors.push(new THREE.Vector3(to.x, to.y + 0.016, to.z));
	}
	// Подвес камеры.
	parts.push(box(0.04, 0.03, 0.03, 0, -0.02, 0.135));
	frame.add(holo(merge(parts), style).group);
	const lens = glowSprite(COLORS.cyan, 0.03);
	lens.position.set(0, -0.02, 0.152);
	frame.add(lens);
	const rotors = makeRotors(
		group,
		motors,
		0.085,
		COLORS.blue,
		new THREE.Color(0x2a3d63),
	);

	// Крепление: площадка под брюхом с гнездом и резинка вокруг корпуса.
	const mount = new THREE.Group();
	const mountHolo = holo(
		merge([
			box(0.08, 0.008, 0.13, 0, -0.042, 0),
			cylY(0.03, 0.016, 0, -0.062, 0, 28),
		]),
		{ ...style, rim: COLORS.cyan, edge: COLORS.cyan },
	);
	mount.add(mountHolo.group);
	mount.add(
		glowMesh(
			new THREE.TorusGeometry(0.03, 0.0015, 6, 40)
				.rotateX(Math.PI / 2)
				.translate(0, -0.06, 0),
			COLORS.cyan,
		),
	);
	frame.add(mount);
	const band = glowMesh(
		new THREE.TorusGeometry(0.06, 0.0028, 6, 48)
			.scale(0.95, 0.78, 1)
			.rotateY(Math.PI / 2),
		COLORS.net,
		0.95,
	);
	band.position.set(0, -0.005, 0.0);
	frame.add(band);

	// Сеткомёт: раструб вниз, четыре груза по кромке.
	const launcher = new THREE.Group();
	const shell = holo(
		new THREE.CylinderGeometry(0.024, 0.055, 0.1, 32, 1, true).translate(
			0,
			-0.05,
			0,
		),
		{
			rim: COLORS.blue,
			base: new THREE.Color(0x050b18),
			opacity: 0.75,
			edgeOpacity: 0.3,
			edgeAngle: 40,
		},
	);
	launcher.add(shell.group);
	launcher.add(
		glowMesh(
			new THREE.TorusGeometry(0.056, 0.002, 6, 48)
				.rotateX(Math.PI / 2)
				.translate(0, -0.1, 0),
			COLORS.blue,
		),
	);
	launcher.add(
		glowMesh(
			new THREE.TorusGeometry(0.025, 0.0016, 6, 40)
				.rotateX(Math.PI / 2)
				.translate(0, -0.002, 0),
			COLORS.blue,
		),
	);
	const weights = new THREE.Group();
	const weightColors = [COLORS.hot, COLORS.green, COLORS.hot, COLORS.green];
	weightColors.forEach((color, k) => {
		const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
		const w = holo(
			cylY(0.007, 0.03, Math.cos(a) * 0.048, -0.098, Math.sin(a) * 0.048, 10),
			{
				rim: color,
				edge: color,
				base: new THREE.Color(0x140a05),
				glow: 0.35,
			},
		);
		weights.add(w.group);
	});
	launcher.add(weights);
	// Сеть внутри раструба.
	const inner = new THREE.LineBasicMaterial({
		color: COLORS.net,
		transparent: true,
		opacity: 0.7,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
	for (let k = 0; k < 6; k += 1) {
		const pts = Array.from({ length: 30 }, (_, i) => {
			const a = (i / 29) * Math.PI * 2;
			const y = -0.02 - 0.07 * ((i / 29 + hash(k)) % 1);
			const r = 0.02 + -y * 0.32;
			return new THREE.Vector3(Math.cos(a + k) * r, y, Math.sin(a * 2 + k) * r);
		});
		launcher.add(
			new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), inner),
		);
	}
	const photodiode = glowSprite(COLORS.white, 0.03);
	photodiode.position.set(0.03, -0.035, 0.02);
	launcher.add(photodiode);
	launcher.position.set(0, -0.07, 0);
	frame.add(launcher);
	// Шлейф от платы сеткомёта к разъёму дрона.
	const curve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0.02, -0.08, 0.0),
		new THREE.Vector3(0.05, -0.07, 0.03),
		new THREE.Vector3(0.05, -0.03, 0.06),
		new THREE.Vector3(0.035, -0.01, 0.07),
	]);
	const plug = glowMesh(
		new THREE.TubeGeometry(curve, 24, 0.0018, 5),
		COLORS.red,
		0.95,
	);
	frame.add(plug);
	const socket = anchor(frame, 0, -0.07, 0);
	const mouth = anchor(launcher, 0, -0.1, 0);
	return {
		group,
		frame,
		rotors,
		spin: spinner(rotors),
		mount,
		band,
		launcher,
		socket,
		photodiode,
		plug,
		weights,
		mouth,
	};
}

/* ---- Вултур R10 ------------------------------------------------------------ */

/**
 * Пусковое гнездо Вултура со снарядом. По фотографиям изделия:
 *  - гнездо — чёрный корпус с алюминиевой резьбовой втулкой, смотрит вперёд;
 *  - без снаряда втулка закрыта рифлёной заглушкой;
 *  - снаряд — алюминиевая коническая горловина (накручивается на втулку) и
 *    широкий чёрный барабан с прорезями по кромке торца; в прорезях видны
 *    грузы сети.
 * Всё, что относится к снаряду, лежит в группе socket, ось — +z.
 */
export interface VulturMount {
	/** Точка втулки; ось снаряда — +z этой группы. */
	socket: THREE.Group;
	cap: THREE.Group;
	shell: THREE.Group;
	/** Уложенная сеть: гаснет после выстрела. */
	packed: THREE.Group;
	/** Торец барабана — отсюда вылетает сеть. */
	mouth: THREE.Object3D;
}

export interface Vultur extends Copter {
	/** [верхнее, нижнее]. */
	mounts: [VulturMount, VulturMount];
	top: THREE.Object3D;
	bottom: THREE.Object3D;
	antenna: THREE.Object3D;
	battery: THREE.Object3D;
	arm: THREE.Object3D;
	camera: THREE.Object3D;
}

const SILVER_STYLE: HoloStyle = {
	rim: COLORS.silver,
	base: new THREE.Color(0x2a3240),
	edge: COLORS.silver,
	edgeOpacity: 0.55,
	rimStrength: 1.2,
	edgeAngle: 40,
};

const CASE_STYLE: HoloStyle = {
	rim: COLORS.blue,
	base: new THREE.Color(0x070c16),
	edge: COLORS.blue,
	edgeOpacity: 0.9,
	rimStrength: 0.9,
	edgeAngle: 30,
};

function makeVulturMount(): VulturMount {
	const socket = new THREE.Group();
	// Втулка с резьбой.
	socket.add(holo(cylZ(0.024, 0.022, -0.02, 0, 0, 28), SILVER_STYLE).group);
	for (let k = 0; k < 3; k += 1) {
		socket.add(
			glowMesh(ringZ(0.017, 0.0011, -0.004 - k * 0.005), COLORS.silver, 0.7),
		);
	}

	// Заглушка: рифлёный диск.
	const cap = new THREE.Group();
	const capParts: THREE.BufferGeometry[] = [cylZ(0.026, 0.014, 0, 0, 0, 32)];
	for (let k = 0; k < 10; k += 1) {
		const a = (k / 10) * Math.PI * 2;
		capParts.push(
			box(0.006, 0.006, 0.014, Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.007),
		);
	}
	cap.add(
		holo(merge(capParts), { ...CASE_STYLE, rim: new THREE.Color(0x5b7fc0) })
			.group,
	);
	socket.add(cap);

	// Снаряд: горловина + барабан.
	const shell = new THREE.Group();
	shell.add(
		holo(
			new THREE.CylinderGeometry(0.036, 0.023, 0.05, 28, 1)
				.rotateX(Math.PI / 2)
				.translate(0, 0, 0.025),
			SILVER_STYLE,
		).group,
	);
	const drumParts: THREE.BufferGeometry[] = [
		cylZ(0.062, 0.08, 0.048, 0, 0, 40),
	];
	shell.add(holo(merge(drumParts), CASE_STYLE).group);
	// Прорези по кромке торца — тёмные клинья со светящимися краями.
	const slotMat = makeEdgeMaterial(COLORS.blue, 0.9);
	for (let k = 0; k < 8; k += 1) {
		const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
		const r1 = 0.05;
		const r2 = 0.0625;
		const w = 0.006;
		const pts = [
			new THREE.Vector3(
				Math.cos(a - w / r2) * r2,
				Math.sin(a - w / r2) * r2,
				0.1285,
			),
			new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0.1285),
			new THREE.Vector3(
				Math.cos(a + w / r2) * r2,
				Math.sin(a + w / r2) * r2,
				0.1285,
			),
		];
		shell.add(
			new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), slotMat),
		);
	}
	// Грузы в боковых прорезях барабана — латунные цилиндрики.
	const packed = new THREE.Group();
	for (let k = 0; k < 4; k += 1) {
		const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
		const weight = holo(
			cylZ(0.008, 0.06, 0.06, Math.cos(a) * 0.057, Math.sin(a) * 0.057, 12),
			{
				rim: COLORS.hot,
				edge: COLORS.hot,
				base: new THREE.Color(0x2a1606),
				glow: 0.25,
				edgeOpacity: 0.6,
			},
		);
		packed.add(weight.group);
	}
	const net = glowSprite(COLORS.net, 0.09, 0.8);
	net.position.set(0, 0, 0.11);
	packed.add(net);
	shell.add(packed);
	socket.add(shell);
	return { socket, cap, shell, packed, mouth: anchor(socket, 0, 0, 0.13) };
}

export function makeVultur(): Vultur {
	const group = new THREE.Group();
	const frame = new THREE.Group();
	group.add(frame);
	const style: HoloStyle = { ...DRONE_STYLE, edgeOpacity: 0.85 };
	const parts: THREE.BufferGeometry[] = [
		// Верхняя карбоновая пластина — длинная, с окном.
		box(0.09, 0.008, 0.34, 0, 0.07, 0),
		// Нижняя пластина и стойки стека.
		box(0.1, 0.01, 0.24, 0, -0.005, 0),
		...[
			[0.035, 0.1],
			[-0.035, 0.1],
			[0.035, -0.06],
			[-0.035, -0.06],
		].map(([x, z]) => cylY(0.004, 0.07, x, 0, z, 6)),
		// Стек полётного контроллера.
		box(0.04, 0.025, 0.04, 0, 0.03, -0.02),
		// Аккумулятор под рамой.
		new RoundedBoxGeometry(0.075, 0.065, 0.15, 2, 0.01).translate(
			0,
			-0.045,
			-0.03,
		),
		// Курсовая камера на носу.
		box(0.03, 0.03, 0.03, 0, 0.03, 0.16),
		cylZ(0.012, 0.015, 0.175, 0, 0.03, 16),
		// Антенна видеопередатчика — назад и вверх.
		new THREE.CylinderGeometry(0.003, 0.003, 0.26, 6)
			.rotateX(-0.5)
			.translate(-0.05, 0.18, -0.2),
	];
	const motors: THREE.Vector3[] = [];
	const arm = 0.62;
	for (const [sx, sz] of [
		[1, 1],
		[-1, 1],
		[-1, -1],
		[1, -1],
	]) {
		const mx = (sx * arm) / Math.SQRT2;
		const mz = (sz * arm) / Math.SQRT2;
		parts.push(
			new THREE.BoxGeometry(arm, 0.014, 0.034)
				.translate(arm / 2, 0, 0)
				.rotateY(-Math.atan2(mz, mx)),
		);
		parts.push(cylY(0.035, 0.045, mx, -0.01, mz, 20));
		motors.push(new THREE.Vector3(mx, 0.045, mz));
	}
	// Корпуса пусковых гнёзд: верхний — стойка над рамой сзади, нижний —
	// под камерой спереди.
	parts.push(box(0.05, 0.08, 0.05, 0, 0.115, -0.13));
	parts.push(box(0.05, 0.05, 0.06, 0, -0.06, 0.12));
	frame.add(holo(merge(parts), style).group);

	// Наклейка аккумулятора — оранжевая полоса, как на фото.
	const label = new THREE.Mesh(
		box(0.077, 0.03, 0.03, 0, -0.045, 0.01),
		new THREE.MeshBasicMaterial({
			color: new THREE.Color(0xc2481a),
			fog: true,
		}),
	);
	frame.add(label);
	const lens = glowSprite(COLORS.cyan, 0.03);
	lens.position.set(0, 0.03, 0.19);
	frame.add(lens);
	const tip = glowSprite(COLORS.blue, 0.06);
	tip.position.set(-0.05, 0.29, -0.26);
	frame.add(tip);
	const rotors = makeRotors(
		group,
		motors,
		0.24,
		COLORS.blue,
		new THREE.Color(0x24375c),
	);

	const top = makeVulturMount();
	top.socket.position.set(0, 0.145, -0.105);
	frame.add(top.socket);
	const bottom = makeVulturMount();
	bottom.socket.position.set(0, -0.065, 0.15);
	frame.add(bottom.socket);
	return {
		group,
		frame,
		rotors,
		spin: spinner(rotors),
		mounts: [top, bottom],
		top: top.mouth,
		bottom: bottom.mouth,
		antenna: anchor(frame, -0.05, 0.29, -0.26),
		battery: anchor(frame, 0.038, -0.045, -0.03),
		arm: anchor(frame, motors[0].x, 0.05, motors[0].z),
		camera: anchor(frame, 0, 0.03, 0.18),
	};
}

/* ========================================================================== */
/* Тройная установка: пусковой уголок, снаряды, автомобиль, кабель, пульт     */
/* ========================================================================== */

const STEEL_STYLE: HoloStyle = {
	rim: new THREE.Color(0x5d8fe0),
	base: new THREE.Color(0x070b13),
	edge: new THREE.Color(0x6aa6ff),
	edgeOpacity: 0.95,
	rimStrength: 0.7,
	edgeAngle: 30,
};

const ALU_STYLE: HoloStyle = {
	rim: COLORS.silver,
	base: new THREE.Color(0x3a4352),
	edge: COLORS.silver,
	edgeOpacity: 0.55,
	rimStrength: 1.3,
	edgeAngle: 40,
};

const CONE_STYLE: HoloStyle = {
	rim: new THREE.Color(0x4f7fd6),
	base: new THREE.Color(0x05080e),
	edge: new THREE.Color(0x5b8ee8),
	edgeOpacity: 0.7,
	rimStrength: 0.9,
	edgeAngle: 35,
};

/** Цилиндр вдоль −z: от z0 назад на длину len, радиусы у начала и конца. */
function cylBack(
	rStart: number,
	rEnd: number,
	len: number,
	z0: number,
	x = 0,
	y = 0,
	seg = 28,
) {
	return new THREE.CylinderGeometry(rStart, rEnd, len, seg, 1, true)
		.rotateX(-Math.PI / 2)
		.translate(x, y, z0 - len / 2);
}

export interface TripleRound {
	/** Ось снаряда — −z группы; начало — торец втулки. */
	group: THREE.Group;
	/** Фетровая крышка на раструбе — слетает при выстреле. */
	cap: THREE.Group;
	/** Уложенная сеть, видна в прорезях раструба. */
	packed: THREE.Group;
	/** Центр крышки — отсюда уходит сеть. */
	mouth: THREE.Object3D;
}

export interface TripleLauncher {
	group: THREE.Group;
	/** Резьбовые втулки (точки на торце). */
	bosses: THREE.Object3D[];
	rounds: TripleRound[];
	/** Середина уголка — для выноски «сталь». */
	bracket: THREE.Object3D;
	/** Разъём кабеля пульта на обратной стороне уголка. */
	connector: THREE.Object3D;
}

/**
 * Снаряд тройной установки по фотографиям: алюминиевая горловина с резьбой
 * и муфта, хомут, чёрный раструб-конус с четырьмя продольными прорезями —
 * в них видны алюминиевые грузы-стержни, — торец закрыт фетровой крышкой.
 */
function makeTripleRound(): TripleRound {
	const group = new THREE.Group();
	group.add(
		holo(
			merge([
				cylBack(0.017, 0.017, 0.04, 0.012),
				cylBack(0.025, 0.025, 0.045, -0.026),
			]),
			ALU_STYLE,
		).group,
	);
	// Хомут на узкой части раструба.
	group.add(
		glowMesh(
			new THREE.TorusGeometry(0.03, 0.0025, 6, 36).translate(0, 0, -0.08),
			new THREE.Color(0x1a2338),
			1,
		),
	);
	const cone = holo(cylBack(0.029, 0.058, 0.16, -0.074, 0, 0, 36), CONE_STYLE);
	group.add(cone.group);
	// Грузы в прорезях — алюминиевые стержни вдоль образующей.
	const packed = new THREE.Group();
	for (let k = 0; k < 4; k += 1) {
		const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
		const from = new THREE.Vector3(
			Math.cos(a) * 0.027,
			Math.sin(a) * 0.027,
			-0.085,
		);
		const to = new THREE.Vector3(
			Math.cos(a) * 0.053,
			Math.sin(a) * 0.053,
			-0.225,
		);
		const len = from.distanceTo(to);
		const rod = new THREE.CylinderGeometry(0.0045, 0.0045, len, 8);
		rod.applyQuaternion(
			new THREE.Quaternion().setFromUnitVectors(
				new THREE.Vector3(0, 1, 0),
				to.clone().sub(from).normalize(),
			),
		);
		const mid = from.clone().add(to).multiplyScalar(0.5);
		rod.translate(mid.x, mid.y, mid.z);
		packed.add(holo(rod, { ...ALU_STYLE, glow: 0.15 }).group);
	}
	const net = glowSprite(COLORS.net, 0.07, 0.75);
	net.position.set(0, 0, -0.16);
	packed.add(net);
	group.add(packed);
	// Крышка: фетровый диск на торце раструба.
	const cap = new THREE.Group();
	cap.add(
		holo(cylZ(0.06, 0.006, -0.24, 0, 0, 40), {
			rim: new THREE.Color(0x46618f),
			base: new THREE.Color(0x0b0f17),
			edge: new THREE.Color(0x6d8fc9),
			edgeOpacity: 0.6,
			rimStrength: 0.6,
		}).group,
	);
	group.add(cap);
	return { group, cap, packed, mouth: anchor(group, 0, 0, -0.24) };
}

/**
 * Пусковая установка: стальной уголок длиной ~0,56 м с проушинами по
 * краям (болты и пазы — угол наклона регулируется), три алюминиевые
 * резьбовые втулки на лицевой стороне, накладка и разъём кабеля сзади.
 * Лицевая сторона смотрит в −z.
 */
export function makeTripleLauncher(): TripleLauncher {
	const group = new THREE.Group();
	const L = 0.56;
	const parts: THREE.BufferGeometry[] = [
		// Лицевая полка.
		box(L, 0.12, 0.006, 0, 0.066, 0),
		// Нижняя полка уголка.
		box(L, 0.006, 0.1, 0, 0.006, 0.05),
		// Накладка с винтами на обратной стороне.
		box(0.32, 0.045, 0.005, 0, 0.09, 0.006),
	];
	// Проушины: скруглённая пластина с пазом.
	for (const sx of [-1, 1]) {
		const ear = extrudeSide(
			[
				[-0.01, 0],
				[0.1, 0],
				[0.1, 0.08],
				[0.07, 0.12],
				[-0.01, 0.12],
			],
			0.006,
			[],
			0.001,
		);
		ear.translate(sx * (L / 2 + 0.004), 0, 0);
		parts.push(ear);
	}
	group.add(holo(merge(parts), STEEL_STYLE).group);
	// Болты в проушинах — оцинкованные головки.
	for (const sx of [-1, 1]) {
		for (const [z, y] of [
			[0.035, 0.035],
			[0.07, 0.05],
			[0.03, 0.08],
		]) {
			const bolt = holo(
				new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6)
					.rotateZ(Math.PI / 2)
					.translate(sx * (L / 2 + 0.012), y, z),
				ALU_STYLE,
			);
			group.add(bolt.group);
		}
	}
	// Разъём кабеля (GX16) сзади по центру.
	const conn = holo(cylZ(0.009, 0.022, 0.008, 0, 0.05, 16), ALU_STYLE);
	group.add(conn.group);

	const bosses: THREE.Object3D[] = [];
	const rounds: TripleRound[] = [];
	for (const x of [-0.17, 0, 0.17]) {
		const y = 0.07;
		group.add(holo(cylBack(0.022, 0.022, 0.028, 0, x, y, 28), ALU_STYLE).group);
		for (let k = 0; k < 3; k += 1) {
			group.add(
				glowMesh(
					ringZ(0.0155, 0.001, -0.008 - k * 0.006, y, x),
					COLORS.silver,
					0.7,
				),
			);
		}
		bosses.push(anchor(group, x, y, -0.028));
		const round = makeTripleRound();
		round.group.position.set(x, y, -0.028);
		group.add(round.group);
		rounds.push(round);
	}
	return {
		group,
		bosses,
		rounds,
		bracket: anchor(group, 0.2, 0.12, 0),
		connector: anchor(group, 0, 0.05, 0.03),
	};
}

export interface Car {
	group: THREE.Group;
	wheels: THREE.Group[];
	launcher: TripleLauncher;
	/** Приоткрытое заднее правое окно — туда уходит кабель пульта. */
	window: THREE.Object3D;
}

/**
 * Внедорожник-«голограмма»: нижний кузов, более узкое остекление сверху
 * (завал боковин), арки, бамперы, зеркала, рейлинги с поперечинами. На
 * задней поперечине — пусковая установка стволами назад; белый кабель от
 * неё идёт по крыше и уходит в приоткрытое заднее правое окно, к пульту.
 */
export function makeCar(): Car {
	const group = new THREE.Group();
	const style: HoloStyle = {
		rim: COLORS.blue,
		base: new THREE.Color(0x050a14),
		edge: COLORS.blue,
		edgeOpacity: 0.95,
		edgeAngle: 22,
		rimStrength: 0.2,
	};
	const lower = extrudeSide(
		[
			[-2.3, 0.4],
			[-2.36, 0.62],
			[-2.34, 1.12],
			[1.28, 1.14],
			[2.18, 1.0],
			[2.33, 0.78],
			[2.3, 0.5],
			[2.2, 0.4],
		],
		1.88,
		[],
		0.06,
	);
	const cabin = extrudeSide(
		[
			[-2.22, 1.12],
			[-2.12, 1.72],
			[0.62, 1.74],
			[1.28, 1.14],
		],
		1.66,
		[],
		0.05,
	);
	const extras: THREE.BufferGeometry[] = [
		// Бамперы.
		box(1.9, 0.18, 0.12, 0, 0.5, 2.3),
		box(1.9, 0.18, 0.12, 0, 0.52, -2.36),
		// Зеркала.
		box(0.12, 0.09, 0.06, 1.0, 1.22, 1.05),
		box(0.12, 0.09, 0.06, -1.0, 1.22, 1.05),
		// Рейлинги и поперечины.
		box(0.045, 0.04, 2.7, 0.72, 1.79, -0.75),
		box(0.045, 0.04, 2.7, -0.72, 1.79, -0.75),
		box(1.5, 0.03, 0.05, 0, 1.83, -1.55),
		box(1.5, 0.03, 0.05, 0, 1.83, -0.9),
	];
	group.add(holo(merge([lower, cabin, ...extras]), style).group);

	// Остекление по бортам; заднее правое окно опущено на ширину ладони.
	const winMat = makeEdgeMaterial(COLORS.blue, 0.8);
	const glassMat = makeEdgeMaterial(COLORS.cyan, 0.55);
	const line = (
		pts: Array<[number, number, number]>,
		mat: THREE.LineBasicMaterial,
	) =>
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(
					pts.map((p) => new THREE.Vector3(...p)),
				),
				mat,
			),
		);
	for (const x of [-0.84, 0.84]) {
		const sx = Math.sign(x);
		const xs = x + sx * 0.005;
		line(
			[
				[xs, 1.18, 1.12],
				[xs, 1.62, 0.66],
				[xs, 1.62, -0.05],
				[xs, 1.18, -0.05],
				[xs, 1.18, 1.12],
			],
			winMat,
		);
		line(
			[
				[xs, 1.18, -0.15],
				[xs, 1.62, -0.15],
				[xs, 1.62, -1.2],
				[xs, 1.18, -1.2],
				[xs, 1.18, -0.15],
			],
			winMat,
		);
		line(
			[
				[xs, 1.2, -1.32],
				[xs, 1.62, -1.32],
				[xs, 1.6, -2.02],
				[xs, 1.2, -2.08],
				[xs, 1.2, -1.32],
			],
			winMat,
		);
		// Стекло задней двери справа опущено — верхняя кромка ниже рамы.
		const glassTop = sx > 0 ? 1.52 : 1.6;
		line(
			[
				[xs + sx * 0.003, glassTop, -0.2],
				[xs + sx * 0.003, glassTop, -1.15],
			],
			glassMat,
		);
		// Арки колёс.
		for (const z of [1.45, -1.5]) {
			const arc: Array<[number, number, number]> = [];
			for (let k = 0; k <= 20; k += 1) {
				const a = Math.PI * (k / 20);
				arc.push([
					x + sx * 0.1,
					0.4 + Math.sin(a) * 0.5,
					z + Math.cos(a) * 0.5,
				]);
			}
			line(arc, winMat);
		}
		// Ручки дверей.
		line(
			[
				[xs, 1.08, 0.55],
				[xs, 1.08, 0.38],
			],
			winMat,
		);
		line(
			[
				[xs, 1.08, -0.6],
				[xs, 1.08, -0.77],
			],
			winMat,
		);
	}

	// Колёса: шина, диск, пять спиц.
	const wheels: THREE.Group[] = [];
	const tire = new THREE.CylinderGeometry(0.4, 0.4, 0.27, 32).rotateZ(
		Math.PI / 2,
	);
	for (const [x, z] of [
		[0.86, 1.45],
		[-0.86, 1.45],
		[0.86, -1.5],
		[-0.86, -1.5],
	]) {
		const w = new THREE.Group();
		w.add(holo(tire, style).group);
		const sx = Math.sign(x) * 0.14;
		const spokes: THREE.Vector3[] = [];
		for (let k = 0; k < 5; k += 1) {
			const a = (k / 5) * Math.PI * 2;
			spokes.push(
				new THREE.Vector3(sx, 0, 0),
				new THREE.Vector3(sx, Math.sin(a) * 0.26, Math.cos(a) * 0.26),
			);
		}
		w.add(
			new THREE.LineSegments(
				new THREE.BufferGeometry().setFromPoints(spokes),
				makeEdgeMaterial(COLORS.cyan, 0.8),
			),
		);
		const rim = new THREE.LineLoop(
			new THREE.BufferGeometry().setFromPoints(
				Array.from({ length: 32 }, (_, k) => {
					const a = (k / 32) * Math.PI * 2;
					return new THREE.Vector3(sx, Math.sin(a) * 0.27, Math.cos(a) * 0.27);
				}),
			),
			makeEdgeMaterial(COLORS.cyan, 0.8),
		);
		w.add(rim);
		w.position.set(x, 0.4, z);
		group.add(w);
		wheels.push(w);
	}

	// Пусковая установка на задней поперечине, стволами назад и чуть вверх.
	const launcher = makeTripleLauncher();
	launcher.group.scale.setScalar(1.35);
	launcher.group.position.set(0, 1.845, -1.62);
	launcher.group.rotation.x = 0.14;
	group.add(launcher.group);

	// Кабель пульта: от разъёма по крыше вправо и в щель опущенного окна.
	group.updateMatrixWorld(true);
	const from = launcher.connector.getWorldPosition(new THREE.Vector3());
	const windowPoint = new THREE.Vector3(0.86, 1.56, -0.7);
	const cable = new THREE.CatmullRomCurve3([
		from,
		from.clone().add(new THREE.Vector3(0.05, 0, 0.12)),
		new THREE.Vector3(0.45, 1.82, -1.2),
		new THREE.Vector3(0.78, 1.8, -0.95),
		new THREE.Vector3(0.9, 1.68, -0.8),
		windowPoint.clone().add(new THREE.Vector3(0.04, 0, 0)),
		windowPoint.clone().add(new THREE.Vector3(-0.12, -0.08, 0.02)),
	]);
	group.add(
		new THREE.Mesh(
			new THREE.TubeGeometry(cable, 80, 0.009, 8),
			// Матовый серый: белый цвет под bloom светился бы неоновой трубкой.
			new THREE.MeshBasicMaterial({
				color: new THREE.Color(0x6f7a8a),
				fog: true,
			}),
		),
	);
	const plug = holo(
		cylZ(0.02, 0.05, -0.02, 0, 0, 14)
			.applyQuaternion(
				new THREE.Quaternion().setFromUnitVectors(
					new THREE.Vector3(0, 0, 1),
					cable.getTangent(0),
				),
			)
			.translate(from.x, from.y, from.z),
		ALU_STYLE,
	);
	group.add(plug.group);

	// Фары и стопы.
	for (const x of [-0.7, 0.7]) {
		const head = glowSprite(COLORS.white, 0.35, 0.8);
		head.position.set(x, 0.85, 2.36);
		const tail = glowSprite(COLORS.red, 0.3, 0.9);
		tail.position.set(x, 0.98, -2.38);
		group.add(head, tail);
	}
	return {
		group,
		wheels,
		launcher,
		window: anchor(group, windowPoint.x, windowPoint.y, windowPoint.z),
	};
}

export interface Remote {
	group: THREE.Group;
	/** Откидные красные колпачки (поворот вокруг x, 0 — закрыт). */
	covers: THREE.Group[];
	/** Рычаги тумблеров (поворот вокруг x: + — OFF, − — ON). */
	levers: THREE.Group[];
	leds: THREE.Sprite[];
	power: THREE.Sprite;
}

/**
 * Пульт инициации по фотографии: чёрный корпус со скошенными углами,
 * верхняя панель с тремя тумблерами под откидными красными колпачками,
 * подпись ON/OFF, индикаторы-прорези и клавиша питания I/O; сзади — белый
 * кабель с металлическим разъёмом.
 */
export function makeRemote(): Remote {
	const group = new THREE.Group();
	const style: HoloStyle = {
		rim: new THREE.Color(0x4f7fd6),
		base: new THREE.Color(0x07090f),
		edge: new THREE.Color(0x5b8ee8),
		edgeOpacity: 0.85,
		rimStrength: 0.7,
		edgeAngle: 30,
	};
	// Корпус: восьмиугольник в плане (скошенные углы), выдавлен вверх.
	const W = 0.11;
	const D = 0.13;
	const c = 0.012;
	const shape = new THREE.Shape([
		new THREE.Vector2(-W / 2 + c, -D / 2),
		new THREE.Vector2(W / 2 - c, -D / 2),
		new THREE.Vector2(W / 2, -D / 2 + c),
		new THREE.Vector2(W / 2, D / 2 - c),
		new THREE.Vector2(W / 2 - c, D / 2),
		new THREE.Vector2(-W / 2 + c, D / 2),
		new THREE.Vector2(-W / 2, D / 2 - c),
		new THREE.Vector2(-W / 2, -D / 2 + c),
	]);
	const body = new THREE.ExtrudeGeometry(shape, {
		depth: 0.055,
		bevelEnabled: true,
		bevelThickness: 0.003,
		bevelSize: 0.003,
		bevelSegments: 2,
	});
	body.rotateX(-Math.PI / 2);
	group.add(
		holo(
			merge([
				body,
				// Панель тумблеров.
				box(0.096, 0.004, 0.06, 0, 0.06, -0.028),
				// Клавиша питания.
				box(0.022, 0.006, 0.014, 0, 0.06, 0.038),
			]),
			style,
		).group,
	);
	// Индикаторы-прорези.
	const slotMat = makeEdgeMaterial(new THREE.Color(0x5b8ee8), 0.7);
	for (const x of [-0.03, 0, 0.03]) {
		const pts: THREE.Vector3[] = [];
		for (let k = 0; k < 3; k += 1) {
			pts.push(
				new THREE.Vector3(x - 0.003, 0.0585, 0.008 + k * 0.004),
				new THREE.Vector3(x + 0.003, 0.0585, 0.008 + k * 0.004),
			);
		}
		group.add(
			new THREE.LineSegments(
				new THREE.BufferGeometry().setFromPoints(pts),
				slotMat,
			),
		);
	}
	const power = glowSprite(COLORS.white, 0.012, 0.9);
	power.position.set(0.005, 0.064, 0.038);
	group.add(power);

	const covers: THREE.Group[] = [];
	const levers: THREE.Group[] = [];
	const leds: THREE.Sprite[] = [];
	const coverMat = new THREE.MeshBasicMaterial({
		color: new THREE.Color(0xe0221a),
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});
	for (const x of [-0.03, 0, 0.03]) {
		// Тумблер: гайка, рычаг, красный огонёк на конце.
		group.add(
			holo(
				new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 6).translate(
					x,
					0.064,
					-0.02,
				),
				ALU_STYLE,
			).group,
		);
		const lever = new THREE.Group();
		lever.position.set(x, 0.066, -0.02);
		lever.add(
			holo(
				new THREE.CylinderGeometry(0.0022, 0.0028, 0.016, 8).translate(
					0,
					0.008,
					0,
				),
				ALU_STYLE,
			).group,
		);
		const led = glowSprite(COLORS.red, 0.008, 0.6);
		led.position.set(0, 0.017, 0);
		lever.add(led);
		lever.rotation.x = 0.45;
		group.add(lever);
		levers.push(lever);
		leds.push(led);
		// Колпачок на петле у верхнего края панели.
		const cover = new THREE.Group();
		cover.position.set(x, 0.064, -0.05);
		const capGeo = new THREE.BoxGeometry(0.017, 0.022, 0.034).translate(
			0,
			0.011,
			0.017,
		);
		const capMesh = new THREE.Mesh(capGeo, coverMat);
		capMesh.add(
			new THREE.LineSegments(
				new THREE.EdgesGeometry(capGeo),
				makeEdgeMaterial(COLORS.net, 0.95),
			),
		);
		cover.add(capMesh);
		group.add(cover);
		covers.push(cover);
	}
	// Кабель с разъёмом сзади.
	const cable = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0.03, 0.03, -0.068),
		new THREE.Vector3(0.04, 0.02, -0.12),
		new THREE.Vector3(0.1, 0.0, -0.16),
		new THREE.Vector3(0.18, 0.0, -0.14),
	]);
	group.add(
		new THREE.Mesh(
			new THREE.TubeGeometry(cable, 30, 0.005, 6),
			new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f7a8a) }),
		),
	);
	group.add(holo(cylZ(0.009, 0.02, -0.088, 0.03, 0.03, 14), ALU_STYLE).group);
	return { group, covers, levers, leds, power };
}

/* ========================================================================== */
/* Дорога                                                                     */
/* ========================================================================== */

export function makeRoad(length = 240) {
	const group = new THREE.Group();
	const road = new THREE.Mesh(
		new THREE.PlaneGeometry(7, length).rotateX(-Math.PI / 2),
		new THREE.MeshBasicMaterial({
			color: new THREE.Color(0x0b111c),
			fog: true,
		}),
	);
	road.position.y = 0.005;
	group.add(road);
	const edgeMat = makeEdgeMaterial(new THREE.Color(0x3a5888), 0.6);
	for (const x of [-3.5, 3.5]) {
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(x, 0.01, -length / 2),
					new THREE.Vector3(x, 0.01, length / 2),
				]),
				edgeMat,
			),
		);
	}
	// Разметка и фонари — повторяющиеся, сдвигаются по модулю шага.
	const dashGeo = new THREE.PlaneGeometry(0.14, 2.2).rotateX(-Math.PI / 2);
	const dashes = new THREE.InstancedMesh(
		dashGeo,
		new THREE.MeshBasicMaterial({
			color: new THREE.Color(0x8aa0c4),
			fog: true,
		}),
		40,
	);
	const lampGeo = merge([
		cylY(0.05, 5.5, 0, 0, 0, 8),
		box(1.2, 0.06, 0.06, -0.6, 5.5, 0),
	]);
	const lamps = new THREE.InstancedMesh(
		lampGeo,
		new THREE.MeshBasicMaterial({
			color: new THREE.Color(0x1a2a44),
			fog: true,
		}),
		24,
	);
	group.add(dashes, lamps);
	const m = new THREE.Matrix4();
	return {
		group,
		/** offset — пройденный путь, м. */
		update(offset: number) {
			const step = 6;
			for (let i = 0; i < 40; i += 1) {
				const z =
					((((i * step - offset) % (40 * step)) + 40 * step) % (40 * step)) -
					60;
				m.makeTranslation(0, 0.012, z);
				dashes.setMatrixAt(i, m);
			}
			dashes.instanceMatrix.needsUpdate = true;
			const lstep = 24;
			for (let i = 0; i < 24; i += 1) {
				const side = i % 2 === 0 ? 1 : -1;
				const k = Math.floor(i / 2);
				const z =
					((((k * lstep - offset) % (12 * lstep)) + 12 * lstep) %
						(12 * lstep)) -
					80;
				m.makeTranslation(side * 4.6, 0, z);
				if (side < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
				lamps.setMatrixAt(i, m);
			}
			lamps.instanceMatrix.needsUpdate = true;
		},
	};
}
