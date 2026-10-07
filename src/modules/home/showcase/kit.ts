/**
 * Графический набор моушн-витрины: материалы, окружение, сеть, зона
 * падения, спрайты. Всё процедурное — ни одной загружаемой модели или
 * текстуры, поэтому витрина весит столько, сколько весит three.js.
 *
 * Стиль повторяет утверждённые ролики: тёмная сцена, изделия — «голограммы»
 * (тёмное тело, светящийся по краю силуэт и рёбра), сеть и всё, что связано
 * с перехватом, — раскалённо-оранжевые. Свечение даёт bloom в движке, здесь
 * достаточно сделать светящиеся элементы яркими и аддитивными.
 */

import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

/* ========================================================================== */
/* Палитра и математика                                                       */
/* ========================================================================== */

export const COLORS = {
	bg: new THREE.Color(0x060a12),
	fog: new THREE.Color(0x0a111d),
	horizon: new THREE.Color(0x0f2446),
	ground: new THREE.Color(0x070c15),
	grid: new THREE.Color(0x1b2c47),
	gridMajor: new THREE.Color(0x2a4570),
	cyan: new THREE.Color(0x2fd4ff),
	blue: new THREE.Color(0x2c6dff),
	deep: new THREE.Color(0x0b1730),
	body: new THREE.Color(0x0a1222),
	silver: new THREE.Color(0xc9d6ea),
	net: new THREE.Color(0xff4a1c),
	hot: new THREE.Color(0xffa060),
	red: new THREE.Color(0xff2d1a),
	white: new THREE.Color(0xffffff),
	green: new THREE.Color(0x3dff9a),
} as const;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Доля пройденного отрезка [a, b]. */
export const seg = (t: number, a: number, b: number) =>
	clamp01((t - a) / (b - a));
export const smooth = (a: number, b: number, t: number) => {
	const x = seg(t, a, b);
	return x * x * (3 - 2 * x);
};
export const easeInOut = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
export const easeOut = (x: number) => 1 - (1 - x) ** 3;
export const easeIn = (x: number) => x * x * x;
/** Окно: плавно появляется на [a, a+f], держится, гаснет на [b-f, b]. */
export const windowed = (t: number, a: number, b: number, f = 0.35) =>
	Math.min(smooth(a, a + f, t), 1 - smooth(b - f, b, t));
export const hash = (n: number) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
};
export const lerp = THREE.MathUtils.lerp;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ========================================================================== */
/* Материалы                                                                  */
/* ========================================================================== */

/**
 * Все LineMaterial: им нужно знать размер кадра в пикселях, и движок
 * обновляет его здесь при каждом ресайзе.
 */
export const lineMaterials = new Set<LineMaterial>();

export function makeLineMaterial(params: {
	color: THREE.Color;
	width: number;
	opacity?: number;
	dashed?: boolean;
	dashSize?: number;
	gapSize?: number;
}) {
	const m = new LineMaterial({
		color: params.color.getHex(),
		linewidth: params.width,
		transparent: true,
		opacity: params.opacity ?? 1,
		dashed: params.dashed ?? false,
		dashSize: params.dashSize ?? 0.3,
		gapSize: params.gapSize ?? 0.2,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		worldUnits: false,
	});
	lineMaterials.add(m);
	return m;
}

const HOLO_VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
	vec4 local = vec4(position, 1.0);
	vec3 n = normal;
	#ifdef USE_INSTANCING
		local = instanceMatrix * local;
		n = mat3(instanceMatrix) * n;
	#endif
	vec4 world = modelMatrix * local;
	vW = world.xyz;
	vec4 mvPosition = viewMatrix * world;
	vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * n);
	vV = normalize(-mvPosition.xyz);
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const HOLO_FRAGMENT = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uRim;
uniform float uRimPower;
uniform float uRimStrength;
uniform float uOpacity;
uniform float uScan;
uniform float uScanY;
uniform float uGlow;
#include <common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
	vec3 N = normalize(vN);
	if (!gl_FrontFacing) N = -N;
	float facing = clamp(abs(dot(N, normalize(vV))), 0.0, 1.0);
	float rim = pow(1.0 - facing, uRimPower);
	vec3 L = normalize(vec3(-0.35, 0.75, 0.55));
	float diff = max(dot(N, L), 0.0);
	vec3 col = uBase * (0.45 + 0.9 * diff) + uRim * rim * uRimStrength + uRim * uGlow;
	// Скан-линия: светлая полоса, проходящая по изделию, как на заставке
	// роликов.
	float band = exp(-pow((vW.y - uScanY) * 22.0, 2.0)) * uScan;
	col += uRim * band * 1.6;
	gl_FragColor = vec4(col, uOpacity);
	#include <fog_fragment>
}
`;

export interface HoloMaterial extends THREE.ShaderMaterial {
	uniforms: {
		uBase: { value: THREE.Color };
		uRim: { value: THREE.Color };
		uRimPower: { value: number };
		uRimStrength: { value: number };
		uOpacity: { value: number };
		uScan: { value: number };
		uScanY: { value: number };
		uGlow: { value: number };
	} & Record<string, THREE.IUniform>;
}

export function makeHoloMaterial(opts: {
	base?: THREE.Color;
	rim?: THREE.Color;
	rimPower?: number;
	rimStrength?: number;
	opacity?: number;
	glow?: number;
}): HoloMaterial {
	const opacity = opts.opacity ?? 1;
	const m = new THREE.ShaderMaterial({
		vertexShader: HOLO_VERTEX,
		fragmentShader: HOLO_FRAGMENT,
		uniforms: THREE.UniformsUtils.merge([
			THREE.UniformsLib.fog,
			{
				uBase: { value: (opts.base ?? COLORS.body).clone() },
				uRim: { value: (opts.rim ?? COLORS.blue).clone() },
				uRimPower: { value: opts.rimPower ?? 2.2 },
				uRimStrength: { value: opts.rimStrength ?? 1.1 },
				uOpacity: { value: opacity },
				uScan: { value: 0 },
				uScanY: { value: 0 },
				uGlow: { value: opts.glow ?? 0 },
			},
		]),
		fog: true,
		transparent: opacity < 1,
		depthWrite: opacity >= 1,
		side: THREE.DoubleSide,
	});
	return m as HoloMaterial;
}

export function makeEdgeMaterial(color: THREE.Color, opacity = 0.9) {
	return new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		fog: true,
	});
}

export interface HoloStyle {
	rim?: THREE.Color;
	base?: THREE.Color;
	edge?: THREE.Color;
	edgeOpacity?: number;
	/** Угол, начиная с которого ребро считается ребром (градусы). */
	edgeAngle?: number;
	/** Плотная сетка треугольников поверх — как у рукояти на роликах. */
	wire?: number;
	opacity?: number;
	rimStrength?: number;
	glow?: number;
}

/** Голограмма из геометрии: тело с френелем + светящиеся рёбра. */
export function holo(geometry: THREE.BufferGeometry, style: HoloStyle = {}) {
	const group = new THREE.Group();
	const material = makeHoloMaterial({
		base: style.base,
		rim: style.rim,
		opacity: style.opacity,
		rimStrength: style.rimStrength,
		glow: style.glow,
	});
	const mesh = new THREE.Mesh(geometry, material);
	group.add(mesh);
	const edgeColor = style.edge ?? style.rim ?? COLORS.blue;
	const edges = new THREE.LineSegments(
		new THREE.EdgesGeometry(geometry, style.edgeAngle ?? 28),
		makeEdgeMaterial(edgeColor, style.edgeOpacity ?? 0.85),
	);
	group.add(edges);
	if (style.wire) {
		const wire = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({
				color: edgeColor,
				wireframe: true,
				transparent: true,
				opacity: style.wire,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				fog: true,
			}),
		);
		group.add(wire);
	}
	return { group, mesh, edges, material };
}

/* ========================================================================== */
/* Спрайты                                                                    */
/* ========================================================================== */

let glowTexture: THREE.Texture | null = null;
let softTexture: THREE.Texture | null = null;

function radialTexture(stops: Array<[number, string]>) {
	const c = document.createElement("canvas");
	c.width = 128;
	c.height = 128;
	const g = c.getContext("2d");
	if (g) {
		const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		for (const [at, color] of stops) grad.addColorStop(at, color);
		g.fillStyle = grad;
		g.fillRect(0, 0, 128, 128);
	}
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export function getGlowTexture() {
	glowTexture ??= radialTexture([
		[0, "rgba(255,255,255,1)"],
		[0.18, "rgba(255,255,255,0.85)"],
		[0.45, "rgba(255,255,255,0.22)"],
		[1, "rgba(255,255,255,0)"],
	]);
	return glowTexture;
}

export function getSoftTexture() {
	softTexture ??= radialTexture([
		[0, "rgba(255,255,255,0.9)"],
		[0.5, "rgba(255,255,255,0.35)"],
		[1, "rgba(255,255,255,0)"],
	]);
	return softTexture;
}

/** Светящаяся точка: огни, грузы сети, вспышки. */
export function glowSprite(color: THREE.Color, size: number, opacity = 1) {
	const s = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: getGlowTexture(),
			color,
			transparent: true,
			opacity,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			fog: false,
		}),
	);
	s.scale.setScalar(size);
	return s;
}

/* ========================================================================== */
/* Окружение                                                                  */
/* ========================================================================== */

const GROUND_VERTEX = /* glsl */ `
varying vec3 vW;
void main() {
	vec4 w = modelMatrix * vec4(position, 1.0);
	vW = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uLine;
uniform vec3 uMajor;
uniform vec3 uFog;
uniform vec3 uCam;
uniform float uOffset;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uOpacity;
uniform float uScale;
varying vec3 vW;
float gridLine(vec2 p, float s) {
	vec2 q = p / s;
	vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
	return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
	vec2 p = (vW.xz + vec2(0.0, uOffset)) / uScale;
	float minor = gridLine(p, 1.0);
	float major = gridLine(p, 5.0);
	float d = length(vW.xz - uCam.xz);
	float near = 1.0 - smoothstep(uFadeNear, uFadeFar, d);
	vec3 col = uBase + uLine * minor * 0.55 * near + uMajor * major * 0.9 * near;
	float fogK = smoothstep(uFadeNear * 0.6, uFadeFar * 1.25, d);
	col = mix(col, uFog, fogK);
	gl_FragColor = vec4(col, uOpacity);
}
`;

export function makeGround(size = 600) {
	const material = new THREE.ShaderMaterial({
		vertexShader: GROUND_VERTEX,
		fragmentShader: GROUND_FRAGMENT,
		uniforms: {
			uBase: { value: COLORS.ground.clone() },
			uLine: { value: COLORS.grid.clone() },
			uMajor: { value: COLORS.gridMajor.clone() },
			uFog: { value: COLORS.fog.clone() },
			uCam: { value: new THREE.Vector3() },
			uOffset: { value: 0 },
			uFadeNear: { value: 18 },
			uFadeFar: { value: 70 },
			uOpacity: { value: 1 },
			uScale: { value: 1 },
		},
		transparent: false,
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
	mesh.rotation.x = -Math.PI / 2;
	mesh.renderOrder = -1;
	// Затухание сетки считается от камеры: в длинной погоне камера уходит
	// на сотни метров от начала координат.
	mesh.onBeforeRender = (_r, _s, camera) => {
		material.uniforms.uCam.value.copy(camera.position);
	};
	return {
		mesh,
		material,
		/** Сетка «едет» под стоящей камерой — для сцены с машиной. */
		update(_camera: THREE.Camera, offset = 0) {
			material.uniforms.uOffset.value = offset;
		},
	};
}

/** Небо: вертикальный градиент с подсвеченным горизонтом. */
export function makeSky() {
	const material = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		uniforms: {
			uTop: { value: COLORS.bg.clone() },
			uHorizon: { value: COLORS.horizon.clone() },
			uFog: { value: COLORS.fog.clone() },
		},
		vertexShader: /* glsl */ `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uTop;
			uniform vec3 uHorizon;
			uniform vec3 uFog;
			varying vec3 vDir;
			void main() {
				float h = vDir.y;
				vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.42, h));
				col = mix(col, uFog, smoothstep(0.02, -0.06, h));
				gl_FragColor = vec4(col, 1.0);
			}
		`,
	});
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
	mesh.renderOrder = -2;
	return mesh;
}

/** Базовая сцена с туманом, небом и землёй. */
export function makeWorld(opts: { fogNear?: number; fogFar?: number } = {}) {
	const scene = new THREE.Scene();
	scene.background = COLORS.bg.clone();
	scene.fog = new THREE.Fog(
		COLORS.fog.getHex(),
		opts.fogNear ?? 14,
		opts.fogFar ?? 90,
	);
	const sky = makeSky();
	scene.add(sky);
	const ground = makeGround();
	scene.add(ground.mesh);
	return { scene, sky, ground };
}

/** Лес: тёмные конусы, как в роликах. Один InstancedMesh на всю сцену. */
export function makeTrees(
	count: number,
	seed: number,
	place: (i: number, rnd: (k: number) => number) => THREE.Vector3 | null,
) {
	const geometry = new THREE.ConeGeometry(0.9, 3.4, 7, 1);
	geometry.translate(0, 1.7, 0);
	const material = makeHoloMaterial({
		base: new THREE.Color(0x04070d),
		rim: new THREE.Color(0x1a3a6a),
		rimStrength: 0.7,
		rimPower: 3,
	});
	const mesh = new THREE.InstancedMesh(geometry, material, count);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const s = new THREE.Vector3();
	let n = 0;
	for (let i = 0; i < count * 4 && n < count; i += 1) {
		const rnd = (k: number) => hash(seed + i * 13.7 + k * 3.1);
		const p = place(i, rnd);
		if (!p) continue;
		const k = 0.7 + rnd(5) * 0.9;
		s.set(k, k * (0.8 + rnd(6) * 0.6), k);
		m.compose(p, q, s);
		mesh.setMatrixAt(n, m);
		n += 1;
	}
	mesh.count = n;
	mesh.instanceMatrix.needsUpdate = true;
	return mesh;
}

/* ========================================================================== */
/* Зона падения                                                               */
/* ========================================================================== */

export function makeDropZone(
	radius: number,
	color = COLORS.net,
	width = 0.035,
	filled = true,
) {
	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: {
			uColor: { value: color.clone() },
			uOpacity: { value: 0 },
			uSpin: { value: 0 },
			uDashes: { value: Math.round(radius * 9) },
		},
		vertexShader: /* glsl */ `
			varying vec2 vP;
			void main() {
				vP = position.xy;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			uniform float uSpin;
			uniform float uDashes;
			varying vec2 vP;
			void main() {
				float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
				float dash = step(fract(a * uDashes + uSpin), 0.58);
				gl_FragColor = vec4(uColor * 1.6, uOpacity * dash);
			}
		`,
	});
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(
			radius - width,
			radius + width,
			Math.max(160, Math.round(radius * 24)),
		),
		material,
	);
	ring.rotation.x = -Math.PI / 2;
	const fill = new THREE.Mesh(
		new THREE.CircleGeometry(radius, 64),
		new THREE.MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		}),
	);
	fill.rotation.x = -Math.PI / 2;
	const group = new THREE.Group();
	group.add(ring, fill);
	group.position.y = 0.02;
	return {
		group,
		set(opacity: number, scale: number, time: number) {
			material.uniforms.uOpacity.value = opacity;
			material.uniforms.uSpin.value = time * 0.12;
			(fill.material as THREE.MeshBasicMaterial).opacity = filled
				? opacity * 0.06
				: 0;
			fill.visible = filled;
			group.scale.setScalar(Math.max(0.0001, scale));
			group.visible = opacity > 0.002;
		},
	};
}

/* ========================================================================== */
/* Линии-траектории                                                           */
/* ========================================================================== */

/** Пунктирная линия, которая умеет прочерчиваться на долю длины. */
export function makeTrace(color: THREE.Color, width = 1.4, dashed = true) {
	const geometry = new LineSegmentsGeometry();
	const material = makeLineMaterial({
		color,
		width,
		dashed,
		dashSize: 0.35,
		gapSize: 0.28,
	});
	const line = new LineSegments2(geometry, material);
	line.frustumCulled = false;
	let count = 0;
	return {
		line,
		material,
		/** Точки пути; линия рисуется отрезками между соседними. */
		setPoints(points: THREE.Vector3[]) {
			const arr = new Float32Array((points.length - 1) * 6);
			for (let i = 0; i < points.length - 1; i += 1) {
				points[i].toArray(arr, i * 6);
				points[i + 1].toArray(arr, i * 6 + 3);
			}
			geometry.setPositions(arr);
			line.computeLineDistances();
			count = points.length - 1;
		},
		set(opacity: number, drawn = 1) {
			material.opacity = opacity;
			line.visible = opacity > 0.002 && drawn > 0;
			geometry.instanceCount = Math.max(0, Math.round(count * clamp01(drawn)));
		},
	};
}

/* ========================================================================== */
/* Сеть                                                                       */
/* ========================================================================== */

/** Площадь сети по паспорту — 5,7 м²; половина стороны квадрата. */
export const NET_HALF = Math.sqrt(5.7) / 2;

export interface ShotSpec {
	muzzle: THREE.Vector3;
	/** Точка, где центр сети встречает цель (или проходит её — при промахе). */
	target: THREE.Vector3;
	/** Секунды полёта до target. */
	flight: number;
	/** Размер раскрытой сети (половина стороны). */
	half?: number;
}

export interface WrapSpec {
	/** Центр цели сейчас. */
	center: THREE.Vector3;
	/** Ориентация цели сейчас относительно момента попадания. */
	turn: THREE.Quaternion;
	/** Полуоси мешка вдоль R, U, F. */
	radii: THREE.Vector3;
}

const _F = new THREE.Vector3();
const _R = new THREE.Vector3();
const _U = new THREE.Vector3();
const _C = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _off = new THREE.Vector3();
const _flat = new THREE.Vector3();

/**
 * Полёт, раскрытие и наматывание сети — чистая функция от времени,
 * поэтому прокрутка назад отматывает полёт назад.
 *
 * t — секунды от выстрела. До T (flight) центр летит к цели с торможением,
 * края раскрываются по экспоненте, середина отстаёт куполом. После T:
 *  - если передан wrap — центр упирается в цель, края по инерции
 *    заворачиваются вокруг неё в мешок;
 *  - иначе (промах) — сеть пролетает дальше, теряет скорость и ложится на
 *    землю.
 */
export function solveNet(
	out: THREE.Vector3[],
	n: number,
	shot: ShotSpec,
	t: number,
	wrap?: WrapSpec | null,
) {
	const half = shot.half ?? NET_HALF;
	const T = shot.flight;
	_F.subVectors(shot.target, shot.muzzle);
	const dist = _F.length();
	_F.normalize();
	if (Math.abs(_F.y) > 0.92) _R.set(1, 0, 0);
	else _R.crossVectors(THREE.Object3D.DEFAULT_UP, _F).normalize();
	_U.crossVectors(_F, _R).normalize();

	const k = 2.2 / T;
	const s = (x: number) => (1 - Math.exp(-k * x)) / (1 - Math.exp(-k * T));
	const tf = Math.min(t, T);
	const tau = T * 0.2;
	const e = 1 - Math.exp(-tf / tau);
	const spin = 0.45 * e;
	const cs = Math.cos(spin);
	const sn = Math.sin(spin);
	_C.copy(shot.muzzle).addScaledVector(_F, dist * s(tf));
	const lagMax = Math.min(0.8 * dist * s(tf), 1.7);
	const after = t - T;
	// Масштаб времени: реальный полёт сети ~0,55 с, в ролике он растянут.
	const slow = T / 0.55;
	const wrapTime = 0.3 * slow;
	const wrapK = wrap && after > 0 ? easeOut(clamp01(after / wrapTime)) : 0;
	// Промах: сеть по инерции уходит вперёд и опускается на землю.
	let missDrop = 0;
	let missFwd = 0;
	if (!wrap && after > 0) {
		missFwd = 3.2 * (1 - Math.exp(-after / (0.5 * slow)));
		missDrop = (0.5 * 9.81 * 0.55 * after * after) / (slow * slow);
	}
	for (let i = 0; i < n; i += 1) {
		for (let j = 0; j < n; j += 1) {
			const u = -1 + (2 * i) / (n - 1);
			const v = -1 + (2 * j) / (n - 1);
			const ru = u * cs - v * sn;
			const rv = u * sn + v * cs;
			const corner = Math.abs(u) * Math.abs(v);
			const billow = 0.55 * (1 - u * u) * (1 - v * v) + 0.12 * (1 - corner);
			const lag = lagMax * (1 - e) * (1 - corner) * (0.6 + 0.4 * billow);
			const flutter =
				(0.05 * e + 0.14 * (1 - e)) *
				Math.sin(5.3 * u + 3.1 * v + t * 30 + i * j);
			const flutter2 =
				(0.04 + 0.1 * (1 - e)) * Math.cos(4.1 * v - 2.7 * u + t * 24);

			const node = out[i * n + j];
			if (wrap && after > 0) {
				const extra =
					(Math.min(after, wrapTime) / slow) *
					5 *
					(Math.hypot(u, v) / Math.SQRT2);
				_flat
					.copy(wrap.center)
					.addScaledVector(_F, -wrap.radii.z)
					.addScaledVector(_R, ru * half)
					.addScaledVector(_U, rv * half)
					.addScaledVector(_F, -billow * 0.8 + extra);
				const r = half * Math.hypot(ru, rv);
				const th = Math.atan2(rv, ru);
				const phi = Math.min(r / (wrap.radii.x * 0.78), Math.PI * 0.93);
				const crumple = 0.035 * Math.sin(9 * u + 7 * v + 3);
				_off
					.set(0, 0, 0)
					.addScaledVector(
						_R,
						Math.cos(th) * Math.sin(phi) * (wrap.radii.x + crumple),
					)
					.addScaledVector(
						_U,
						Math.sin(th) * Math.sin(phi) * (wrap.radii.y + crumple),
					)
					.addScaledVector(_F, -Math.cos(phi) * (wrap.radii.z + crumple))
					.applyQuaternion(wrap.turn);
				_tmp.copy(wrap.center).add(_off);
				node.copy(_flat).lerp(_tmp, wrapK);
				node.y = Math.max(0.02, node.y);
				continue;
			}
			node
				.copy(_C)
				.addScaledVector(_R, ru * half * e + flutter * (1 - corner))
				.addScaledVector(_U, rv * half * e + flutter2 * (1 - corner))
				.addScaledVector(_F, -(lag + billow * e * 0.8));
			if (missFwd > 0 || missDrop > 0) {
				node.addScaledVector(_F, missFwd * (0.85 + 0.15 * corner));
				// Середина провисает раньше краёв — сеть «садится» куполом.
				node.y -= missDrop * (1 + 0.25 * billow);
				node.y = Math.max(0.03 + 0.02 * Math.sin(u * 7 + v * 5), node.y);
			}
		}
	}
	return out;
}

/** Сеть: шнуры толстыми линиями + четыре светящихся груза по углам. */
export class Net {
	readonly group = new THREE.Group();
	readonly nodes: THREE.Vector3[];
	readonly n: number;
	private readonly positions: Float32Array;
	private readonly geometry = new LineSegmentsGeometry();
	private readonly material: LineMaterial;
	private readonly weights: THREE.Sprite[] = [];
	private readonly cores: THREE.Mesh[] = [];
	private readonly segs: Array<[number, number]> = [];

	constructor(n = 12, color = COLORS.net) {
		this.n = n;
		this.nodes = Array.from({ length: n * n }, () => new THREE.Vector3());
		for (let i = 0; i < n; i += 1) {
			for (let j = 0; j < n; j += 1) {
				if (i + 1 < n) this.segs.push([i * n + j, (i + 1) * n + j]);
				if (j + 1 < n) this.segs.push([i * n + j, i * n + j + 1]);
			}
		}
		this.positions = new Float32Array(this.segs.length * 6);
		this.geometry.setPositions(this.positions);
		this.material = makeLineMaterial({ color, width: 1.6 });
		const line = new LineSegments2(this.geometry, this.material);
		line.frustumCulled = false;
		this.group.add(line);
		const coreGeo = new THREE.SphereGeometry(0.045, 10, 8);
		for (let k = 0; k < 4; k += 1) {
			const core = new THREE.Mesh(
				coreGeo,
				new THREE.MeshBasicMaterial({ color: COLORS.hot, fog: false }),
			);
			const glow = glowSprite(COLORS.net, 0.6);
			this.cores.push(core);
			this.weights.push(glow);
			this.group.add(core, glow);
		}
		this.group.visible = false;
	}

	/** Перенести узлы в буфер линий и грузы — в углы. */
	commit(opacity = 1) {
		const p = this.positions;
		for (let s = 0; s < this.segs.length; s += 1) {
			const [a, b] = this.segs[s];
			this.nodes[a].toArray(p, s * 6);
			this.nodes[b].toArray(p, s * 6 + 3);
		}
		const attr = this.geometry.attributes
			.instanceStart as THREE.InterleavedBufferAttribute;
		attr.data.needsUpdate = true;
		this.material.opacity = opacity;
		const n = this.n;
		const corners = [0, n - 1, n * (n - 1), n * n - 1];
		corners.forEach((c, k) => {
			this.cores[k].position.copy(this.nodes[c]);
			this.weights[k].position.copy(this.nodes[c]);
			(this.weights[k].material as THREE.SpriteMaterial).opacity = opacity;
		});
		this.group.visible = opacity > 0.002;
	}

	hide() {
		this.group.visible = false;
	}
}

/* ========================================================================== */
/* Выстрел: вспышка, дым                                                      */
/* ========================================================================== */

/** Дульная вспышка и облако дыма; всё — функция от секунд после выстрела. */
export class MuzzleFx {
	readonly group = new THREE.Group();
	private readonly flash: THREE.Sprite;
	private readonly core: THREE.Sprite;
	private readonly puffs: THREE.Sprite[] = [];
	private readonly seeds: Array<[number, number, number, number]> = [];

	constructor(scale = 1, puffCount = 18) {
		this.flash = glowSprite(COLORS.hot, 1.2 * scale);
		this.core = glowSprite(COLORS.white, 0.5 * scale);
		this.group.add(this.flash, this.core);
		const mat = new THREE.SpriteMaterial({
			map: getSoftTexture(),
			color: new THREE.Color(0x5d6a80),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			fog: true,
		});
		for (let i = 0; i < puffCount; i += 1) {
			const s = new THREE.Sprite(mat.clone());
			this.puffs.push(s);
			this.group.add(s);
			this.seeds.push([
				hash(i * 3.1),
				hash(i * 7.3),
				hash(i * 1.7),
				hash(i * 9.9),
			]);
		}
		this.group.visible = false;
	}

	update(t: number, muzzle: THREE.Vector3, dir: THREE.Vector3, scale = 1) {
		if (t < 0 || t > 3.2) {
			this.group.visible = false;
			return;
		}
		this.group.visible = true;
		const a = clamp01(1 - t / 0.09);
		this.flash.position.copy(muzzle).addScaledVector(dir, 0.08 * scale);
		this.flash.scale.setScalar((0.6 + 1.6 * a) * scale);
		(this.flash.material as THREE.SpriteMaterial).opacity = a;
		this.core.position.copy(this.flash.position);
		this.core.scale.setScalar(0.5 * scale * (0.5 + a));
		(this.core.material as THREE.SpriteMaterial).opacity = a;
		const side = _R.crossVectors(THREE.Object3D.DEFAULT_UP, dir).normalize();
		this.puffs.forEach((p, i) => {
			const [r1, r2, r3, r4] = this.seeds[i];
			const speed = (2.5 + 6 * r1) * scale;
			const travel = speed * ((1 - Math.exp(-5 * t)) / 5);
			p.position
				.copy(muzzle)
				.addScaledVector(dir, travel * (0.5 + r2))
				.addScaledVector(side, (r3 - 0.5) * travel * 0.9)
				.add(
					_tmp.set(
						0.2 * t,
						(0.15 + 0.35 * r4) * t + (r4 - 0.4) * travel * 0.4,
						0,
					),
				);
			const size = (0.08 + (0.5 + 0.6 * r2) * (1 - Math.exp(-2.4 * t))) * scale;
			p.scale.setScalar(size);
			const alpha =
				(1 - Math.exp(-t / 0.02)) * Math.exp(-t / 1.1) * (0.25 + 0.3 * r3);
			(p.material as THREE.SpriteMaterial).opacity = alpha;
		});
	}
}

/* ========================================================================== */
/* Мелочи                                                                     */
/* ========================================================================== */

/** Позиция по ключам времени с Катмулл-Ромом и плавностью на отрезке. */
export function track(keys: Array<[number, THREE.Vector3]>) {
	const out = new THREE.Vector3();
	return (t: number) => {
		if (t <= keys[0][0]) return out.copy(keys[0][1]);
		const last = keys[keys.length - 1];
		if (t >= last[0]) return out.copy(last[1]);
		let i = 0;
		while (i < keys.length - 2 && t > keys[i + 1][0]) i += 1;
		const p0 = keys[Math.max(0, i - 1)][1];
		const p1 = keys[i][1];
		const p2 = keys[i + 1][1];
		const p3 = keys[Math.min(keys.length - 1, i + 2)][1];
		const x = easeInOut(seg(t, keys[i][0], keys[i + 1][0]));
		const x2 = x * x;
		const x3 = x2 * x;
		for (const c of ["x", "y", "z"] as const) {
			out[c] =
				0.5 *
				(2 * p1[c] +
					(-p0[c] + p2[c]) * x +
					(2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * x2 +
					(-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * x3);
		}
		return out;
	};
}

/** Освобождает GPU-ресурсы всего поддерева. */
export function disposeTree(root: THREE.Object3D) {
	root.traverse((o) => {
		const mesh = o as THREE.Mesh;
		mesh.geometry?.dispose?.();
		const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
		if (Array.isArray(mat)) for (const m of mat) m.dispose();
		else mat?.dispose?.();
	});
}
