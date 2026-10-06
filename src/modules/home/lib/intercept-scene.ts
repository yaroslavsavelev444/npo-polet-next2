/**
 * Сцена перехвата для секции «Принцип»: 3D на голом Canvas 2D.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ТАК
 * ────────────────────────────────────────────────────────────────────────────
 * Прежняя схема была плоским SVG, анимированным calc() от --p. Перспективу,
 * раскрытие сети как сетки узлов и её наматывание на аппарат в calc() не
 * выразить, а WebGL-движок ради одной иллюстрации — сотни килобайт. Здесь
 * своя маленькая проекция: камера, плоское затенение граней, сортировка по
 * глубине. Весь кадр — несколько сотен примитивов, это дешевле любого
 * видеофона.
 *
 * Модель та же, что была: единственный вход — прогресс прокрутки p (0..1),
 * нарезанный на три такта с прежними границами. Всё, что связано с
 * выстрелом, — ЧИСТАЯ функция от p: прокрутка назад отматывает полёт сети
 * назад, а не проигрывает его заново. От живого времени зависят только
 * «декоративные» вещи, которым не нужно согласие с текстом: вращение винтов,
 * покачивание зависшего аппарата, мигание огней.
 *
 * Механика взята с видео реального пуска: пистолетная рукоять, крупный
 * цилиндр-кассета сверху, белая крышка на дульном срезе. Пороховой картридж
 * даёт резкий подброс ствола вверх и облако дыма; крышка вылетает первой и,
 * кувыркаясь, падает; четыре груза расходятся конусом и вытягивают за собой
 * сеть — сначала спутанным жгутом, затем квадратом. Площадь квадрата —
 * паспортные 5.7 м², поэтому половина стороны — √5.7 / 2.
 */

type Vec = [number, number, number];
type RGB = [number, number, number];
type Mat = number[];

/* ========================================================================== */
/* Математика                                                                 */
/* ========================================================================== */

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a: Vec, b: Vec, s: number): Vec => [
	a[0] + b[0] * s,
	a[1] + b[1] * s,
	a[2] + b[2] * s,
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec): Vec => mul(a, 1 / (len(a) || 1));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec, b: Vec, t: number): Vec => [
	lerp(a[0], b[0], t),
	lerp(a[1], b[1], t),
	lerp(a[2], b[2], t),
];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Детерминированный «шум»: одинаковый на каждом кадре для одного индекса. */
const hash = (n: number) => {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
};

/** Поворот: сначала крен (z), затем тангаж (x), затем рыскание (y). */
function rotation(yaw: number, pitch: number, roll = 0): Mat {
	const cy = Math.cos(yaw);
	const sy = Math.sin(yaw);
	const cp = Math.cos(pitch);
	const sp = Math.sin(pitch);
	const cr = Math.cos(roll);
	const sr = Math.sin(roll);
	// Ry · Rx · Rz, записано сразу результатом.
	return [
		cy * cr + sy * sp * sr,
		-cy * sr + sy * sp * cr,
		sy * cp,
		cp * sr,
		cp * cr,
		-sp,
		-sy * cr + cy * sp * sr,
		sy * sr + cy * sp * cr,
		cy * cp,
	];
}

const apply = (m: Mat, v: Vec): Vec => [
	m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
	m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
	m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/* ========================================================================== */
/* Мир                                                                        */
/* ========================================================================== */

const G = 9.81;
/** Рука оператора — ось, вокруг которой доворачивается и подбрасывается ствол. */
const PIVOT: Vec = [0, 1.45, 0];
/** Точка зависания аппарата: ~12 м, в пределах рабочих 25 м. */
const HOVER: Vec = [1.3, 4.6, 11.5];
const APPROACH_FROM: Vec = [8, 7.2, 24];
/**
 * Масштаб аппарата: размах ~1.2 м с винтами — средний мультикоптер. Модель
 * описана в «единичном» масштабе, чтобы пропорции читались из чисел.
 */
const DRONE_SCALE = 1.6;
/** Полётное время сети до цели, с. */
const T_HIT = 0.55;
/** Сколько секунд реального времени покрывает третий такт. */
const T_CAPTURE = 2.3;
/** Половина стороны квадрата сети площадью 5.7 м². */
const NET_HALF = Math.sqrt(5.7) / 2;
const NET_N = 11;
/** Линейное сопротивление воздуха для грузов, 1/с. */
const DRAG = 1.2;
const DRONE_FALL_G = 7.4;
const DRONE_REST_Y = 0.3;
const UP: Vec = [0, 1, 0];
const LIGHT = norm([-0.45, 0.85, -0.4]);
const SHOT_AT = 0.06;
const REST_PITCH = -0.42;

/** Локальная точка дульного среза в координатах аппарата. */
const MUZZLE_LOCAL: Vec = [0, 0.074, 0.2];

const dragS = (t: number) => (1 - Math.exp(-DRAG * t)) / DRAG;

/**
 * Прицел и баллистика считаются один раз: аппарат зависает в известной
 * точке, и центр сети должен прийти в его переднюю грань ровно в T_HIT.
 */
const ballistics = (() => {
	let yaw = 0;
	let pitch = 0;
	let muzzle: Vec = PIVOT;
	let v0: Vec = [0, 0, 1];
	let target: Vec = HOVER;
	for (let i = 0; i < 4; i += 1) {
		muzzle = add(PIVOT, apply(rotation(yaw, pitch), MUZZLE_LOCAL));
		const f = norm(sub(HOVER, muzzle));
		target = madd(HOVER, f, -0.34 * DRONE_SCALE);
		const gravity: Vec = [0, 0.5 * G * T_HIT * T_HIT, 0];
		v0 = mul(add(sub(target, muzzle), gravity), 1 / dragS(T_HIT));
		yaw = Math.atan2(v0[0], v0[2]);
		pitch = Math.atan2(v0[1], Math.hypot(v0[0], v0[2]));
	}
	const F = norm(v0);
	const R = norm(cross(UP, F));
	const U = cross(F, R);
	const Fh = norm([F[0], 0, F[2]]);
	return { yaw, pitch, muzzle, v0, F, R, U, Fh };
})();

const netCenter = (t: number): Vec => {
	const { muzzle, v0 } = ballistics;
	return madd(madd(muzzle, v0, dragS(t)), UP, -0.5 * G * t * t);
};

/** Момент касания земли после захвата, отсчитанный от попадания. */
const LAND_AFTER =
	Math.sqrt((2 * (HOVER[1] - DRONE_REST_Y)) / DRONE_FALL_G) + 0.1;

function droneAfterHit(tc: number): { pos: Vec; landed: number } {
	const { Fh } = ballistics;
	const push = 0.9 * (1 - Math.exp(-tc / 0.18));
	const drift = 0.45 * Math.min(tc, LAND_AFTER);
	let pos = madd(HOVER, Fh, push + drift);
	const tf = Math.max(0, tc - 0.1);
	let y = HOVER[1] - 0.5 * DRONE_FALL_G * tf * tf;
	let landed = 0;
	if (tc >= LAND_AFTER) {
		const k = tc - LAND_AFTER;
		landed = 1;
		y = DRONE_REST_Y + 0.22 * Math.exp(-k / 0.12) * Math.abs(Math.sin(k * 16));
	}
	pos = [pos[0], Math.max(DRONE_REST_Y, y), pos[2]];
	return { pos, landed };
}

const LANDING = droneAfterHit(LAND_AFTER + 5).pos;

/* ========================================================================== */
/* Геометрия                                                                  */
/* ========================================================================== */

interface Mesh {
	v: Vec[];
	f: number[][];
	color: RGB;
}

function box(
	x0: number,
	x1: number,
	y0: number,
	y1: number,
	z0: number,
	z1: number,
	color: RGB,
): Mesh {
	return {
		v: [
			[x0, y0, z0],
			[x1, y0, z0],
			[x1, y1, z0],
			[x0, y1, z0],
			[x0, y0, z1],
			[x1, y0, z1],
			[x1, y1, z1],
			[x0, y1, z1],
		],
		// Обход против часовой при взгляде снаружи — по нему считается нормаль.
		f: [
			[0, 3, 2, 1],
			[4, 5, 6, 7],
			[0, 4, 7, 3],
			[1, 2, 6, 5],
			[3, 7, 6, 2],
			[0, 1, 5, 4],
		],
		color,
	};
}

/** Цилиндр вдоль оси (z — для ствола, y — для моторов аппарата). */
function cylinder(
	axis: "y" | "z",
	c: Vec,
	r: number,
	a0: number,
	a1: number,
	seg: number,
	color: RGB,
	caps = true,
): Mesh {
	const v: Vec[] = [];
	for (let i = 0; i < seg; i += 1) {
		const a = (i / seg) * Math.PI * 2;
		const p = Math.cos(a) * r;
		const q = Math.sin(a) * r;
		if (axis === "z") {
			v.push([c[0] + p, c[1] + q, a0], [c[0] + p, c[1] + q, a1]);
		} else {
			v.push([c[0] + p, a0, c[2] + q], [c[0] + p, a1, c[2] + q]);
		}
	}
	const f: number[][] = [];
	for (let i = 0; i < seg; i += 1) {
		const j = (i + 1) % seg;
		f.push(
			axis === "z"
				? [i * 2, j * 2, j * 2 + 1, i * 2 + 1]
				: [i * 2, i * 2 + 1, j * 2 + 1, j * 2],
		);
	}
	if (caps) {
		const back = Array.from({ length: seg }, (_, i) => i * 2);
		const front = Array.from({ length: seg }, (_, i) => (seg - 1 - i) * 2 + 1);
		f.push(
			axis === "z" ? back.reverse() : back,
			axis === "z" ? front.reverse() : front,
		);
	}
	return { v, f, color };
}

const POLYMER: RGB = [34, 38, 46];
const LAUNCHER: Mesh[] = [
	// Рукоять с наклоном назад, как у пистолетной.
	{
		v: [
			[-0.017, -0.125, -0.088],
			[0.017, -0.125, -0.088],
			[0.017, 0.002, -0.056],
			[-0.017, 0.002, -0.056],
			[-0.017, -0.125, -0.036],
			[0.017, -0.125, -0.036],
			[0.017, 0.002, 0.002],
			[-0.017, 0.002, 0.002],
		],
		f: box(0, 0, 0, 0, 0, 0, POLYMER).f,
		color: POLYMER,
	},
	box(-0.018, 0.018, 0, 0.032, -0.07, 0.115, [40, 45, 54]),
	// Спусковая скоба.
	box(-0.006, 0.006, -0.042, -0.034, -0.012, 0.05, POLYMER),
	box(-0.006, 0.006, -0.042, 0, 0.046, 0.054, POLYMER),
	// Кассета с сетью — крупный цилиндр над рамой.
	cylinder("z", [0, 0.074, 0], 0.044, -0.078, 0.2, 22, [30, 34, 41]),
	// Металлический хомут.
	cylinder("z", [0, 0.074, 0], 0.0475, 0.004, 0.03, 22, [128, 136, 148], false),
	// Планка сверху.
	box(-0.009, 0.009, 0.116, 0.126, -0.05, 0.15, [48, 53, 62]),
];
const CAP_COLOR: RGB = [236, 238, 241];

const DRONE_GREY: RGB = [64, 70, 80];
const ARM = 0.27;
const MOTORS: Vec[] = [
	[ARM, 0.012, ARM],
	[-ARM, 0.012, ARM],
	[-ARM, 0.012, -ARM],
	[ARM, 0.012, -ARM],
];
const DRONE: Mesh[] = [
	box(-0.11, 0.11, -0.045, 0.045, -0.17, 0.17, DRONE_GREY),
	box(-0.08, 0.08, 0.045, 0.075, -0.11, 0.13, [84, 92, 104]),
	// Аккумулятор под корпусом.
	box(-0.07, 0.07, -0.085, -0.045, -0.12, 0.08, [44, 48, 56]),
	...MOTORS.map((m) =>
		cylinder("y", m, 0.032, -0.012, 0.038, 12, [38, 42, 50]),
	),
];
const PROP_R = 0.17;

/* ========================================================================== */
/* Цвета темы                                                                 */
/* ========================================================================== */

interface Palette {
	dark: boolean;
	bg: RGB;
	rule: RGB;
	border: RGB;
	text: RGB;
	muted: RGB;
	primary: RGB;
	accent: RGB;
	font: string;
}

function parseColor(value: string, fallback: RGB): RGB {
	const rgb = value.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
	const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
	if (srgb) {
		return [
			Number(srgb[1]) * 255,
			Number(srgb[2]) * 255,
			Number(srgb[3]) * 255,
		];
	}
	return fallback;
}

/**
 * Токены темы читаются через настоящее свойство color, а не через
 * getPropertyValue('--x'): вычисленное значение пользовательского свойства —
 * это строка «light-dark(…, …)», которую canvas не поймёт. color же
 * браузер разрешает до rgb с учётом data-scheme и .scheme-dark.
 */
function readPalette(probe: HTMLElement, fontSource: HTMLElement): Palette {
	const read = (token: string, fallback: RGB) => {
		probe.style.color = `var(${token})`;
		return parseColor(getComputedStyle(probe).color, fallback);
	};
	const bg = read("--void-deep", [13, 16, 21]);
	const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
	return {
		dark: lum < 0.5,
		bg,
		rule: read("--rule", [38, 44, 55]),
		border: read("--border-light", [70, 78, 93]),
		text: read("--text-secondary", [179, 186, 197]),
		muted: read("--text-muted", [139, 148, 163]),
		primary: read("--primary", [255, 69, 0]),
		accent: read("--accent", [0, 140, 255]),
		font: getComputedStyle(fontSource).fontFamily || "ui-monospace, monospace",
	};
}

const css = (c: RGB, a = 1) =>
	`rgb(${c[0] | 0} ${c[1] | 0} ${c[2] | 0} / ${a.toFixed(3)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
	lerp(a[0], b[0], t),
	lerp(a[1], b[1], t),
	lerp(a[2], b[2], t),
];

/** Мягкий круглый спрайт: дым и пыль рисуются им, а не градиентом на кадр. */
function makeSprite(color: RGB): HTMLCanvasElement {
	const s = document.createElement("canvas");
	s.width = 64;
	s.height = 64;
	const g = s.getContext("2d");
	if (!g) return s;
	const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
	grad.addColorStop(0, css(color, 1));
	grad.addColorStop(0.45, css(color, 0.55));
	grad.addColorStop(1, css(color, 0));
	g.fillStyle = grad;
	g.fillRect(0, 0, 64, 64);
	return s;
}

/* ========================================================================== */
/* Камера                                                                     */
/* ========================================================================== */

interface Camera {
	eye: Vec;
	r: Vec;
	u: Vec;
	f: Vec;
	fpx: number;
	cx: number;
	cy: number;
}

interface Pt {
	x: number;
	y: number;
	z: number;
}

const NEAR = 0.06;

function makeCamera(eye: Vec, target: Vec, w: number, h: number): Camera {
	const f = norm(sub(target, eye));
	const r = norm(cross(UP, f));
	const u = cross(f, r);
	// Фокус задаётся горизонтальным углом, но не даёт вертикальному
	// раскрыться меньше ~48°: на широкой и низкой схеме кадр не «наезжает».
	// На узкой схеме (телефон) угол шире, иначе устройство на первом плане
	// обрезается краем.
	const half = w / h < 1.45 ? 0.66 : 0.56;
	const fpx = Math.min(w / 2 / Math.tan(half), h / 2 / Math.tan(0.42));
	return { eye, r, u, f, fpx, cx: w / 2, cy: h * 0.47 };
}

const toCam = (cam: Camera, p: Vec): Vec => {
	const d = sub(p, cam.eye);
	return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)];
};

const projCam = (cam: Camera, c: Vec): Pt => ({
	x: cam.cx + (c[0] * cam.fpx) / c[2],
	y: cam.cy - (c[1] * cam.fpx) / c[2],
	z: c[2],
});

function project(cam: Camera, p: Vec): Pt | null {
	const c = toCam(cam, p);
	return c[2] < NEAR ? null : projCam(cam, c);
}

/** Отрезок, обрезанный по ближней плоскости. */
function projectSeg(cam: Camera, a: Vec, b: Vec): [Pt, Pt] | null {
	let ca = toCam(cam, a);
	let cb = toCam(cam, b);
	if (ca[2] < NEAR && cb[2] < NEAR) return null;
	if (ca[2] < NEAR) ca = lerp3(ca, cb, (NEAR - ca[2]) / (cb[2] - ca[2]));
	else if (cb[2] < NEAR) cb = lerp3(cb, ca, (NEAR - cb[2]) / (ca[2] - cb[2]));
	return [projCam(cam, ca), projCam(cam, cb)];
}

/**
 * Опорные планы камеры по прогрессу. Начало — из-за плеча оператора, как на
 * видео; на выстреле камера отъезжает вбок, чтобы показать полёт сети целиком;
 * на захвате — подходит к аппарату и провожает его до земли.
 */
const SHOTS: Array<{ p: number; eye: Vec; at: Vec }> = [
	{ p: 0, eye: [0.72, 1.74, -1.35], at: [0.3, 2.15, 6] },
	{ p: 0.3, eye: [0.66, 1.7, -1.2], at: [0.55, 2.8, 8] },
	{ p: 0.345, eye: [0.68, 1.71, -1.24], at: [0.55, 2.85, 8] },
	{ p: 0.5, eye: [5.4, 2.7, 2.2], at: [0.6, 3.0, 6.8] },
	{ p: 0.62, eye: [6.0, 4.1, 8.0], at: [1.3, 4.3, 11.5] },
	{ p: 0.8, eye: [6.2, 3.0, 8.4], at: [1.5, 2.8, 12] },
	{ p: 1, eye: [5.8, 2.4, 8.8], at: [1.6, 1.9, 12.2] },
];

/** Катмулл-Ром по опорным планам: скорость камеры непрерывна, без рывков. */
function cameraPath(p: number): { eye: Vec; at: Vec } {
	let i = 0;
	while (i < SHOTS.length - 2 && p > SHOTS[i + 1].p) i += 1;
	const a = SHOTS[Math.max(0, i - 1)];
	const b = SHOTS[i];
	const c = SHOTS[i + 1];
	const d = SHOTS[Math.min(SHOTS.length - 1, i + 2)];
	const t = easeInOut(clamp01((p - b.p) / (c.p - b.p)));
	const cr = (p0: Vec, p1: Vec, p2: Vec, p3: Vec): Vec => {
		const t2 = t * t;
		const t3 = t2 * t;
		const out: Vec = [0, 0, 0];
		for (let k = 0; k < 3; k += 1) {
			out[k] =
				0.5 *
				(2 * p1[k] +
					(-p0[k] + p2[k]) * t +
					(2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
					(-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
		}
		return out;
	};
	return {
		eye: cr(a.eye, b.eye, c.eye, d.eye),
		at: cr(a.at, b.at, c.at, d.at),
	};
}

/* ========================================================================== */
/* Кадр                                                                       */
/* ========================================================================== */

interface Item {
	z: number;
	draw: () => void;
}

interface FrameState {
	/** Сглаженный прогресс прокрутки. */
	p: number;
	/** Живое время, с — только для декоративных движений. */
	time: number;
	/** Накопленный угол винтов. */
	spin: number;
	w: number;
	h: number;
}

/** Секунды от выстрела. Отрицательно — выстрела ещё не было. */
export function shotTime(p: number) {
	const p2 = clamp01((p - 0.3) / 0.32);
	const p3 = clamp01((p - 0.62) / 0.3);
	if (p < 0.62) return ((p2 - SHOT_AT) / (1 - SHOT_AT)) * T_HIT;
	// Начало захвата растянуто: наматывание сети длится доли секунды, а
	// именно ради него и смотрят третий такт. Секунды на таймере при этом
	// честные — растягивается прокрутка, а не физика.
	return T_HIT + p3 ** 1.7 * T_CAPTURE;
}

/** Обороты винтов как доля номинала: глохнут, когда сеть наматывается. */
export function rotorSpeed(p: number) {
	return 1 - smooth(0, 0.28, shotTime(p) - T_HIT);
}

function render(
	ctx: CanvasRenderingContext2D,
	pal: Palette,
	sprites: { smoke: HTMLCanvasElement; dust: HTMLCanvasElement },
	s: FrameState,
) {
	const { p, time, w, h } = s;
	const p1 = clamp01(p / 0.3);
	const t = shotTime(p);
	const fired = t >= 0;
	const tc = t - T_HIT;
	const captured = tc >= 0;

	/* ---- Аппарат ---------------------------------------------------------- */
	const approach = easeOut(clamp01(p1 / 0.62));
	const hoverK = captured ? 1 - smooth(0, 0.2, tc) : 1;
	const bob: Vec = [
		0.05 * Math.sin(time * 1.3) * hoverK,
		0.07 * Math.sin(time * 1.9 + 1) * hoverK,
		0.04 * Math.sin(time * 1.1 + 2) * hoverK,
	];
	let dronePos: Vec;
	let droneRot: Mat;
	if (!captured) {
		const arc = lerp3(APPROACH_FROM, HOVER, approach);
		arc[1] += Math.sin(approach * Math.PI) * 0.8;
		dronePos = add(arc, bob);
		// Подлетая, аппарат наклонён по ходу и выравнивается при торможении.
		const lean = 0.32 * (1 - approach) ** 2;
		droneRot = rotation(
			Math.PI + 0.35 - 0.5 * (1 - approach),
			-lean,
			0.04 * Math.sin(time * 1.6),
		);
	} else {
		const after = droneAfterHit(tc);
		dronePos = add(after.pos, bob);
		const fall = smooth(0, LAND_AFTER, tc);
		const tumble = Math.sin(tc * 5.2) * 0.12 * (1 - after.landed);
		droneRot = rotation(
			Math.PI + 0.35 + 0.5 * fall,
			-0.38 * fall + tumble,
			0.55 * fall - tumble * 0.6,
		);
	}

	/* ---- Камера ----------------------------------------------------------- */
	const path = cameraPath(p);
	let at = path.at;
	if (captured) at = madd(at, sub(dronePos, HOVER), 0.72 * smooth(0, 0.25, tc));
	// Толчок при выстреле: короткая затухающая дрожь.
	if (fired && t < 0.3) {
		const k = Math.exp(-t / 0.05) * 0.09;
		at = add(at, [Math.sin(t * 160) * k, Math.cos(t * 130) * k, 0]);
	}
	// Ручная съёмка: едва заметный дрейф, чтобы кадр не был мёртвым.
	const eye = add(path.eye, [
		Math.sin(time * 0.6) * 0.03,
		Math.sin(time * 0.8 + 1) * 0.02,
		0,
	]);
	const cam = makeCamera(eye, at, w, h);

	ctx.clearRect(0, 0, w, h);
	drawSky(ctx, cam, pal, w, h);
	drawGround(ctx, cam, pal);

	const items: Item[] = [];

	/* ---- Ствол ------------------------------------------------------------ */
	const aim = easeInOut(clamp01(p1 / 0.86));
	let yaw = lerp(0.04, ballistics.yaw, aim);
	let pitch = lerp(REST_PITCH, ballistics.pitch, aim);
	let back = 0;
	if (!fired) {
		// Дрожь рук при наведении стихает к моменту захвата цели.
		const tremor = 0.007 * (1 - 0.75 * aim);
		yaw += Math.sin(time * 6.1) * tremor;
		pitch += Math.sin(time * 7.7 + 0.5) * tremor;
	} else {
		// Подброс от порохового картриджа: резкий рост, затем возврат.
		const kick = (1 - Math.exp(-t / 0.009)) * Math.exp(-t / 0.1);
		pitch += 0.62 * kick - 0.05 * Math.sin(clamp01(t / 0.6) * Math.PI);
		yaw -= 0.08 * kick;
		back = 0.045 * kick;
		// После захвата оператор опускает пусковое устройство.
		pitch -= 0.35 * smooth(0.9, 2.4, t);
	}
	const lRot = rotation(yaw, pitch);
	const toWorld = (v: Vec) =>
		add(PIVOT, apply(lRot, [v[0], v[1], v[2] - back]));
	for (const m of LAUNCHER)
		pushMesh(ctx, items, cam, pal, m.v.map(toWorld), m.f, m.color);

	// Дульный срез: до выстрела закрыт белой крышкой, после — тёмный канал.
	const muzzleNow = toWorld(MUZZLE_LOCAL);
	const disc = (r: number, z: number) =>
		Array.from({ length: 22 }, (_, i): Vec => {
			const a = (i / 22) * Math.PI * 2;
			return toWorld([Math.cos(a) * r, 0.074 + Math.sin(a) * r, z]);
		});
	if (!fired) {
		pushPoly(ctx, items, cam, pal, disc(0.041, 0.2015), CAP_COLOR, 0.002);
	} else {
		pushPoly(ctx, items, cam, pal, disc(0.04, 0.2015), [10, 11, 14], 0.002);
		pushPoly(ctx, items, cam, pal, disc(0.026, 0.2016), [26, 22, 20], 0.003);
	}
	// Индикатор готовности на тыльной стороне кассеты — зелёная точка, как
	// на видео.
	const led = project(cam, toWorld([0, 0.074, -0.081]));
	if (led) {
		items.push({
			z: led.z - 0.01,
			draw: () =>
				glow(
					ctx,
					led.x,
					led.y,
					Math.min(2.2, Math.max(0.8, (0.005 * cam.fpx) / led.z)),
					[61, 220, 132],
					0.9,
				),
		});
	}

	/* ---- Аппарат: корпус, винты, огни ------------------------------------- */
	const dWorld = (v: Vec) =>
		add(dronePos, apply(droneRot, mul(v, DRONE_SCALE)));
	for (const m of DRONE)
		pushMesh(ctx, items, cam, pal, m.v.map(dWorld), m.f, m.color);
	// Лучи рамы и стойки — толстыми линиями с перспективной толщиной.
	for (const m of MOTORS) {
		pushRod(
			ctx,
			items,
			cam,
			dWorld([m[0] * 0.25, 0, m[2] * 0.25]),
			dWorld([m[0], 0, m[2]]),
			0.026 * DRONE_SCALE,
			shadeFlat(pal, [52, 57, 66], 0.75),
		);
	}
	for (const sx of [-0.09, 0.09]) {
		pushRod(
			ctx,
			items,
			cam,
			dWorld([sx, -0.045, 0.06]),
			dWorld([sx * 1.5, -0.17, 0.09]),
			0.012 * DRONE_SCALE,
			css([46, 50, 58]),
		);
		pushRod(
			ctx,
			items,
			cam,
			dWorld([sx, -0.045, -0.08]),
			dWorld([sx * 1.5, -0.17, -0.11]),
			0.012 * DRONE_SCALE,
			css([46, 50, 58]),
		);
		pushRod(
			ctx,
			items,
			cam,
			dWorld([sx * 1.5, -0.17, 0.16]),
			dWorld([sx * 1.5, -0.17, -0.18]),
			0.014 * DRONE_SCALE,
			css([46, 50, 58]),
		);
	}
	// Подвес камеры под носом.
	const gimbal = project(cam, dWorld([0, -0.07, 0.19]));
	if (gimbal) {
		const r = Math.max(1.4, (0.035 * DRONE_SCALE * cam.fpx) / gimbal.z);
		items.push({
			z: gimbal.z,
			draw: () => {
				ctx.fillStyle = css([24, 26, 31]);
				ctx.beginPath();
				ctx.arc(gimbal.x, gimbal.y, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = css(pal.accent, 0.8);
				ctx.beginPath();
				ctx.arc(
					gimbal.x + r * 0.2,
					gimbal.y - r * 0.15,
					r * 0.4,
					0,
					Math.PI * 2,
				);
				ctx.fill();
			},
		});
	}
	const omega = rotorSpeed(p);
	MOTORS.forEach((m, i) => {
		const hub: Vec = [m[0], 0.045, m[2]];
		const dir = i % 2 === 0 ? 1 : -1;
		// Диск размытия: виден, пока винт крутится, и гаснет вместе с ним.
		const ring = Array.from({ length: 20 }, (_, k): Vec => {
			const a = (k / 20) * Math.PI * 2;
			return dWorld([
				hub[0] + Math.cos(a) * PROP_R,
				hub[1],
				hub[2] + Math.sin(a) * PROP_R,
			]);
		});
		const pts = ring.map((v) => project(cam, v));
		const c = project(cam, dWorld(hub));
		if (c && pts.every(Boolean)) {
			items.push({
				z: c.z - 0.02,
				draw: () => {
					if (omega > 0.02) {
						ctx.fillStyle = css(
							pal.dark ? [170, 182, 200] : [60, 68, 80],
							0.13 * omega,
						);
						ctx.strokeStyle = css(
							pal.dark ? [190, 200, 215] : [50, 56, 66],
							0.22 * omega,
						);
						ctx.lineWidth = 0.6;
						ctx.beginPath();
						for (const q of pts as Pt[]) ctx.lineTo(q.x, q.y);
						ctx.closePath();
						ctx.fill();
						ctx.stroke();
					}
					// Лопасти: при номинале — бледный след, при остановке — чёткие.
					const a0 = s.spin * dir + i * 1.3;
					ctx.strokeStyle = css([28, 31, 37], lerp(0.95, 0.35, omega));
					ctx.lineCap = "round";
					ctx.lineWidth = Math.max(1, (0.022 * DRONE_SCALE * cam.fpx) / c.z);
					ctx.beginPath();
					for (const off of [0, Math.PI]) {
						const e = project(
							cam,
							dWorld([
								hub[0] + Math.cos(a0 + off) * PROP_R,
								hub[1],
								hub[2] + Math.sin(a0 + off) * PROP_R,
							]),
						);
						if (!e) continue;
						ctx.moveTo(c.x, c.y);
						ctx.lineTo(e.x, e.y);
					}
					ctx.stroke();
				},
			});
		}
		// Навигационные огни на лучах: красный слева, зелёный справа.
		const ledP = project(cam, dWorld([m[0] * 1.02, -0.02, m[2] * 1.02]));
		if (ledP) {
			const on = Math.sin(time * 6 + i) > -0.2 ? 1 : 0.25;
			items.push({
				z: ledP.z - 0.03,
				draw: () =>
					glow(
						ctx,
						ledP.x,
						ledP.y,
						Math.min(2, Math.max(0.9, (0.012 * cam.fpx) / ledP.z)),
						m[0] > 0 ? [255, 70, 60] : [70, 230, 140],
						0.85 * on,
					),
			});
		}
	});

	// Тень аппарата на земле — главный признак глубины в этой сцене.
	drawShadow(ctx, cam, pal, dronePos, 0.4 * DRONE_SCALE);

	/* ---- Выстрел: вспышка, дым, крышка, грузы и сеть ---------------------- */
	if (fired) {
		pushShot(items, ctx, cam, pal, sprites, t, muzzleNow);
		const nodes = netNodes(t, dronePos, droneRot);
		pushNet(items, ctx, cam, pal, nodes, t);
	}

	// Пыль при ударе о землю — короткое облачко вокруг точки падения.
	const sinceLand = tc - LAND_AFTER;
	if (sinceLand > 0 && sinceLand < 0.9) {
		for (let i = 0; i < 12; i += 1) {
			const a = (i / 12) * Math.PI * 2 + hash(i) * 0.5;
			const spread =
				0.25 +
				0.9 * (1 - Math.exp(-sinceLand / 0.18)) * (0.6 + 0.4 * hash(i + 9));
			const q = project(cam, [
				dronePos[0] + Math.cos(a) * spread,
				0.06 + 0.25 * sinceLand * hash(i + 3),
				dronePos[2] + Math.sin(a) * spread * 0.8,
			]);
			if (!q) continue;
			const rp = ((0.18 + 0.3 * sinceLand) * cam.fpx) / q.z;
			const alpha = 0.45 * (1 - sinceLand / 0.9);
			items.push({
				z: q.z,
				draw: () => {
					ctx.globalAlpha = alpha;
					ctx.drawImage(sprites.dust, q.x - rp, q.y - rp, rp * 2, rp * 2);
					ctx.globalAlpha = 1;
				},
			});
		}
	}

	items.sort((a, b) => b.z - a.z);
	for (const it of items) it.draw();

	/* ---- Разметка поверх сцены -------------------------------------------- */
	drawOverlay(ctx, cam, pal, {
		p1,
		t,
		time,
		dronePos,
		muzzle: muzzleNow,
		w,
		h,
	});
}

/* ---- Рисование сцены ------------------------------------------------------ */

function shade(pal: Palette, base: RGB, n: Vec, center: Vec, eye: Vec): string {
	const V = norm(sub(eye, center));
	const diff = Math.max(0, dot(n, LIGHT));
	const H = norm(add(LIGHT, V));
	const spec = Math.max(0, dot(n, H)) ** 28 * 0.6;
	// Контровой свет по краю силуэта: на тёмной теме тёмный пластик иначе
	// сливается с фоном.
	const rim = (1 - Math.max(0, dot(n, V))) ** 2.4 * (pal.dark ? 0.45 : 0.25);
	const rimC: RGB = pal.dark ? [140, 165, 205] : [255, 255, 255];
	const k = 0.42 + 0.8 * diff;
	return css([
		Math.min(255, base[0] * k + 255 * spec + rimC[0] * rim),
		Math.min(255, base[1] * k + 255 * spec + rimC[1] * rim),
		Math.min(255, base[2] * k + 255 * spec + rimC[2] * rim),
	]);
}

function shadeFlat(pal: Palette, base: RGB, k: number) {
	return css(mix(base, pal.dark ? [120, 135, 160] : [255, 255, 255], 0.12 * k));
}

function pushMesh(
	ctx: CanvasRenderingContext2D,
	items: Item[],
	cam: Camera,
	pal: Palette,
	verts: Vec[],
	faces: number[][],
	color: RGB,
) {
	for (const face of faces) {
		const a = verts[face[0]];
		const b = verts[face[1]];
		const c = verts[face[2]];
		const n = norm(cross(sub(b, a), sub(c, a)));
		let center: Vec = [0, 0, 0];
		for (const i of face) center = add(center, verts[i]);
		center = mul(center, 1 / face.length);
		if (dot(n, sub(cam.eye, center)) <= 0) continue;
		const pts = face.map((i) => project(cam, verts[i]));
		if (!pts.every(Boolean)) continue;
		const fill = shade(pal, color, n, center, cam.eye);
		items.push({
			z: toCam(cam, center)[2],
			draw: () => {
				ctx.fillStyle = fill;
				ctx.strokeStyle = fill;
				ctx.lineWidth = 0.6;
				ctx.beginPath();
				for (const q of pts as Pt[]) ctx.lineTo(q.x, q.y);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			},
		});
	}
}

function pushPoly(
	ctx: CanvasRenderingContext2D,
	items: Item[],
	cam: Camera,
	pal: Palette,
	verts: Vec[],
	color: RGB,
	bias: number,
) {
	const n = norm(cross(sub(verts[1], verts[0]), sub(verts[2], verts[0])));
	let center: Vec = [0, 0, 0];
	for (const v of verts) center = add(center, v);
	center = mul(center, 1 / verts.length);
	if (dot(n, sub(cam.eye, center)) <= 0) return;
	const pts = verts.map((v) => project(cam, v));
	if (!pts.every(Boolean)) return;
	const fill = shade(pal, color, n, center, cam.eye);
	items.push({
		z: toCam(cam, center)[2] - bias,
		draw: () => {
			ctx.fillStyle = fill;
			ctx.beginPath();
			for (const q of pts as Pt[]) ctx.lineTo(q.x, q.y);
			ctx.closePath();
			ctx.fill();
		},
	});
}

function pushRod(
	ctx: CanvasRenderingContext2D,
	items: Item[],
	cam: Camera,
	a: Vec,
	b: Vec,
	thick: number,
	color: string,
) {
	const seg = projectSeg(cam, a, b);
	if (!seg) return;
	const [pa, pb] = seg;
	const z = (pa.z + pb.z) / 2;
	items.push({
		z,
		draw: () => {
			ctx.strokeStyle = color;
			ctx.lineCap = "round";
			ctx.lineWidth = Math.max(0.8, (thick * cam.fpx) / z);
			ctx.beginPath();
			ctx.moveTo(pa.x, pa.y);
			ctx.lineTo(pb.x, pb.y);
			ctx.stroke();
		},
	});
}

function glow(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	r: number,
	c: RGB,
	a: number,
) {
	const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
	g.addColorStop(0, css([255, 255, 255], a));
	g.addColorStop(0.25, css(c, a));
	g.addColorStop(1, css(c, 0));
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
	ctx.fill();
}

function drawSky(
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	pal: Palette,
	w: number,
	h: number,
) {
	// Горизонт — проекция далёкой точки по направлению взгляда.
	const far = project(
		cam,
		add(cam.eye, mul(norm([cam.f[0], 0, cam.f[2]]), 400)),
	);
	const hy = far ? far.y : h * 0.5;
	const g = ctx.createLinearGradient(0, hy - h * 0.6, 0, hy + h * 0.1);
	g.addColorStop(0, css(pal.bg, 0));
	g.addColorStop(0.85, css(pal.accent, pal.dark ? 0.07 : 0.06));
	g.addColorStop(1, css(pal.accent, 0));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);
	// Тонкая линия горизонта.
	ctx.strokeStyle = css(pal.border, 0.5);
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, hy);
	ctx.lineTo(w, hy);
	ctx.stroke();
}

/**
 * Земля — перспективная сетка с метром в ячейке. Отрезки группируются по
 * пяти уровням прозрачности: пять обводок вместо тысячи.
 */
function drawGround(ctx: CanvasRenderingContext2D, cam: Camera, pal: Palette) {
	const levels = 5;
	const paths = Array.from({ length: levels }, () => new Path2D());
	const major = Array.from({ length: levels }, () => new Path2D());
	const fog = (p: Vec) => {
		const d = len(sub(p, cam.eye));
		return clamp01(1 - (d - 6) / 30);
	};
	const addSeg = (a: Vec, b: Vec, isMajor: boolean) => {
		const k = fog(lerp3(a, b, 0.5));
		if (k <= 0) return;
		const seg = projectSeg(cam, a, b);
		if (!seg) return;
		const level = Math.min(levels - 1, Math.floor(k * levels));
		const path = (isMajor ? major : paths)[level];
		path.moveTo(seg[0].x, seg[0].y);
		path.lineTo(seg[1].x, seg[1].y);
	};
	for (let x = -12; x <= 14; x += 1) {
		for (let z = -4; z < 40; z += 2) addSeg([x, 0, z], [x, 0, z + 2], x === 0);
	}
	for (let z = -4; z <= 40; z += 1) {
		for (let x = -12; x < 14; x += 2)
			addSeg([x, 0, z], [x + 2, 0, z], z % 5 === 0 && z > 0);
	}
	ctx.lineWidth = 1;
	for (let i = 0; i < levels; i += 1) {
		const a = (i + 1) / levels;
		ctx.strokeStyle = css(pal.rule, a);
		ctx.stroke(paths[i]);
		ctx.strokeStyle = css(pal.border, a * 0.9);
		ctx.stroke(major[i]);
	}

	// Рабочая дистанция: дуга 25 м вокруг позиции расчёта.
	ctx.save();
	ctx.setLineDash([4, 5]);
	ctx.strokeStyle = css(pal.accent, 0.55);
	ctx.lineWidth = 1;
	ctx.beginPath();
	let started = false;
	for (let a = -0.7; a <= 0.7; a += 0.02) {
		const q = project(cam, [Math.sin(a) * 25, 0, Math.cos(a) * 25]);
		if (!q) {
			started = false;
			continue;
		}
		if (started) ctx.lineTo(q.x, q.y);
		else ctx.moveTo(q.x, q.y);
		started = true;
	}
	ctx.stroke();
	ctx.restore();

	// Подписи дистанции на земле.
	ctx.font = `500 9px ${pal.font}`;
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";
	let lastY = Number.POSITIVE_INFINITY;
	for (const z of [5, 10, 15, 20, 25]) {
		const q = project(cam, [-0.5, 0, z]);
		// У горизонта метки сжимаются перспективой — слипшиеся пропускаем.
		if (!q || lastY - q.y < 12) continue;
		lastY = q.y;
		ctx.fillStyle = css(
			z === 25 ? pal.accent : pal.muted,
			fog([-0.5, 0, z]) * 0.95,
		);
		ctx.fillText(z === 25 ? "25 м" : `${z}`, q.x, q.y);
	}

	// Позиция расчёта — метка на земле под оператором.
	const base = project(cam, [0, 0, 0]);
	if (base) {
		ctx.strokeStyle = css(pal.primary, 0.7);
		ctx.lineWidth = 1;
		ctx.beginPath();
		const ring: Pt[] = [];
		for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.3) {
			const q = project(cam, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45]);
			if (q) ring.push(q);
		}
		for (const q of ring) ctx.lineTo(q.x, q.y);
		ctx.stroke();
	}
}

function drawShadow(
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	pal: Palette,
	pos: Vec,
	size: number,
) {
	const height = pos[1];
	const spread = size + height * 0.09;
	const strength = (pal.dark ? 0.55 : 0.22) / (1 + height * 0.35);
	// Три вложенных пятна вместо blur(): фильтры canvas в Safari не работают.
	for (const [k, a] of [
		[1.5, 0.25],
		[1.1, 0.4],
		[0.7, 0.6],
	] as const) {
		ctx.fillStyle = css([0, 0, 0], strength * a);
		ctx.beginPath();
		for (let i = 0; i < 18; i += 1) {
			const ang = (i / 18) * Math.PI * 2;
			const q = project(cam, [
				pos[0] + Math.cos(ang) * spread * k * 0.62,
				0.005,
				pos[2] + Math.sin(ang) * spread * k * 0.62,
			]);
			if (!q) return;
			ctx.lineTo(q.x, q.y);
		}
		ctx.closePath();
		ctx.fill();
	}
}

/* ---- Выстрел -------------------------------------------------------------- */

function pushShot(
	items: Item[],
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	pal: Palette,
	sprites: { smoke: HTMLCanvasElement; dust: HTMLCanvasElement },
	t: number,
	muzzleNow: Vec,
) {
	const { F, R, U, muzzle } = ballistics;

	// Вспышка: доли секунды, белое ядро в цвете бренда по краю.
	if (t < 0.06) {
		const q = project(cam, muzzleNow);
		if (q) {
			const a = 1 - t / 0.06;
			const r =
				Math.min(cam.cy * 0.45, Math.max(6, (0.2 * cam.fpx) / q.z)) *
				(0.6 + 0.6 * a);
			items.push({
				z: q.z - 0.5,
				draw: () => {
					const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
					g.addColorStop(0, css([255, 250, 235], a));
					g.addColorStop(0.3, css([255, 190, 90], a * 0.85));
					g.addColorStop(0.7, css(pal.primary, a * 0.35));
					g.addColorStop(1, css(pal.primary, 0));
					ctx.fillStyle = g;
					ctx.beginPath();
					ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
					ctx.fill();
				},
			});
		}
	}

	// Искры — короткие трассы конусом по оси выстрела.
	if (t < 0.12) {
		for (let i = 0; i < 12; i += 1) {
			const dir = norm(
				add(
					F,
					add(
						mul(R, (hash(i) - 0.5) * 0.7),
						mul(U, (hash(i + 40) - 0.5) * 0.7),
					),
				),
			);
			const speed = 9 + hash(i + 80) * 10;
			const head = madd(muzzle, dir, speed * dragS(t * 3) * 0.3);
			const tail = madd(head, dir, -0.25);
			const seg = projectSeg(cam, tail, head);
			if (!seg) continue;
			const a = 1 - t / 0.12;
			items.push({
				z: seg[1].z,
				draw: () => {
					ctx.strokeStyle = css([255, 200, 120], a);
					ctx.lineWidth = 1.1;
					ctx.beginPath();
					ctx.moveTo(seg[0].x, seg[0].y);
					ctx.lineTo(seg[1].x, seg[1].y);
					ctx.stroke();
				},
			});
		}
	}

	// Дым: облако вырывается вперёд, тормозит, разрастается, всплывает и
	// медленно сносится — как сизое облако над стволом на видео.
	for (let i = 0; i < 30; i += 1) {
		const r1 = hash(i * 3.1);
		const r2 = hash(i * 7.3);
		const r3 = hash(i * 1.7);
		const dir = norm(
			add(
				mul(F, 0.4 + 1.3 * r1),
				add(mul(R, (r2 - 0.5) * 1.3), mul(U, (r3 - 0.5) * 1.1 + 0.25)),
			),
		);
		const speed = 4 + 8 * hash(i * 5.9);
		const pos = add(madd(muzzle, dir, speed * ((1 - Math.exp(-5 * t)) / 5)), [
			0.25 * t,
			0.32 * t,
			0.05 * t,
		]);
		const q = project(cam, pos);
		if (!q) continue;
		const radius =
			0.05 + (0.35 + 0.5 * hash(i * 2.3)) * (1 - Math.exp(-2.2 * t));
		const alpha =
			(1 - Math.exp(-t / 0.015)) *
			Math.exp(-t / 1.5) *
			(0.35 + 0.35 * hash(i * 9.1));
		if (alpha < 0.01) continue;
		const rp = (radius * cam.fpx) / q.z;
		items.push({
			z: q.z,
			draw: () => {
				ctx.globalAlpha = alpha * (pal.dark ? 0.75 : 0.9);
				ctx.drawImage(sprites.smoke, q.x - rp, q.y - rp, rp * 2, rp * 2);
				ctx.globalAlpha = 1;
			},
		});
	}

	// Белая крышка кассеты: вылетает первой, кувыркается и опускается
	// медленнее грузов — она лёгкая и парусит.
	{
		const v: Vec = add(add(mul(F, 5), mul(U, 1.4)), mul(R, 0.7));
		let pos = madd(
			madd(muzzle, v, (1 - Math.exp(-2.6 * t)) / 2.6),
			UP,
			-0.5 * 2.6 * t * t,
		);
		pos = add(pos, [Math.sin(t * 7) * 0.12 * t, 0, Math.cos(t * 5) * 0.08 * t]);
		const onGround = pos[1] <= 0.02;
		pos[1] = Math.max(0.02, pos[1]);
		const spinA = onGround ? 1.3 : t * 9;
		const spinB = onGround ? 0.1 : t * 5.5;
		const rot = rotation(spinA, onGround ? Math.PI / 2 : spinB, t * 3);
		const corners = Array.from({ length: 12 }, (_, i): Vec => {
			const a = (i / 12) * Math.PI * 2;
			return add(
				pos,
				apply(rot, [Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0]),
			);
		});
		const front = norm(
			cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])),
		);
		const facing = dot(front, sub(cam.eye, pos)) > 0;
		pushPoly(
			ctx,
			items,
			cam,
			pal,
			facing ? corners : [...corners].reverse(),
			CAP_COLOR,
			0,
		);
	}
}

/* ---- Сеть ----------------------------------------------------------------- */

/**
 * Узлы сети в момент t (секунды от выстрела).
 *
 * Полёт: грузы в углах расходятся по экспоненте к паспортному квадрату,
 * центр сети отстаёт — сначала жгутом от дульного среза, затем куполом,
 * выгнутым назад (грузы тянут края вперёд).
 *
 * Захват: центр упирается в аппарат, края по инерции уходят вперёд и
 * заворачиваются вокруг него в мешок. Мешок поворачивается вместе с
 * аппаратом и падает с ним.
 */
function netNodes(t: number, droneC: Vec, droneRot: Mat): Vec[] {
	const { F, R, U, muzzle } = ballistics;
	const nodes: Vec[] = [];
	const tc = t - T_HIT;
	const tf = Math.min(t, T_HIT);
	const e = 1 - Math.exp(-tf / 0.11);
	const spin = 0.45 * e;
	const cs = Math.cos(spin);
	const sn = Math.sin(spin);
	const C = netCenter(tf);
	const travelled = len(sub(C, muzzle));
	const lagMax = Math.min(0.8 * travelled, 1.7);
	const wrap = tc > 0 ? easeOut(clamp01(tc / 0.3)) : 0;
	// Поворот мешка относительно ориентации аппарата в момент попадания.
	const rest = rotation(Math.PI + 0.35, 0, 0);
	const restInv = [
		rest[0],
		rest[3],
		rest[6],
		rest[1],
		rest[4],
		rest[7],
		rest[2],
		rest[5],
		rest[8],
	];

	for (let i = 0; i < NET_N; i += 1) {
		for (let j = 0; j < NET_N; j += 1) {
			const u = -1 + (2 * i) / (NET_N - 1);
			const v = -1 + (2 * j) / (NET_N - 1);
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

			let base = C;
			let extra = 0;
			if (tc > 0) {
				// После попадания центр стоит у передней грани аппарата, края
				// продолжают лететь вперёд.
				base = madd(droneC, F, -0.34 * DRONE_SCALE);
				extra = (Math.min(tc, 0.3) * 5.5 * Math.hypot(u, v)) / Math.SQRT2;
			}
			let flat = madd(base, R, ru * NET_HALF * e);
			flat = madd(flat, U, rv * NET_HALF * e);
			flat = madd(flat, F, -(lag + billow * e * 0.8) + extra);
			flat = madd(flat, R, flutter * (1 - corner));
			flat = madd(flat, U, flutter2 * (1 - corner));

			if (wrap <= 0) {
				nodes.push(flat);
				continue;
			}
			// Мешок: точка сети на радиусе r от центра ложится на эллипсоид
			// вокруг аппарата под углом r / 0.42 от передней грани.
			const r = NET_HALF * Math.hypot(ru, rv);
			const th = Math.atan2(rv, ru);
			const phi = Math.min(r / (0.26 * DRONE_SCALE), Math.PI * 0.93);
			const crumple = 0.035 * Math.sin(9 * u + 7 * v + 3);
			let off: Vec = [0, 0, 0];
			off = madd(
				off,
				R,
				Math.cos(th) * Math.sin(phi) * (0.34 * DRONE_SCALE + crumple),
			);
			off = madd(
				off,
				U,
				Math.sin(th) * Math.sin(phi) * (0.17 * DRONE_SCALE + crumple),
			);
			off = madd(off, F, -Math.cos(phi) * (0.3 * DRONE_SCALE + crumple));
			off = apply(droneRot, apply(restInv, off));
			const wrapped = add(droneC, off);
			const node = lerp3(flat, wrapped, wrap);
			node[1] = Math.max(0.015, node[1]);
			nodes.push(node);
		}
	}
	return nodes;
}

function pushNet(
	items: Item[],
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	pal: Palette,
	nodes: Vec[],
	t: number,
) {
	const { F } = ballistics;
	const at = (i: number, j: number) => nodes[i * NET_N + j];
	const cord = pal.dark ? mix(pal.primary, [255, 255, 255], 0.08) : pal.primary;
	const pushCord = (a: Vec, b: Vec) => {
		const seg = projectSeg(cam, a, b);
		if (!seg) return;
		const z = (seg[0].z + seg[1].z) / 2;
		items.push({
			z,
			draw: () => {
				ctx.strokeStyle = css(cord, 0.88);
				ctx.lineWidth = Math.max(0.55, Math.min(1.8, (0.014 * cam.fpx) / z));
				ctx.beginPath();
				ctx.moveTo(seg[0].x, seg[0].y);
				ctx.lineTo(seg[1].x, seg[1].y);
				ctx.stroke();
			},
		});
	};
	for (let i = 0; i < NET_N; i += 1) {
		for (let j = 0; j < NET_N; j += 1) {
			if (i + 1 < NET_N) pushCord(at(i, j), at(i + 1, j));
			if (j + 1 < NET_N) pushCord(at(i, j), at(i, j + 1));
		}
	}
	// Грузы в углах: металлические цилиндрики со смазанным следом в полёте.
	const speed = t < T_HIT ? Math.exp(-DRAG * t) : 0;
	for (const [i, j] of [
		[0, 0],
		[0, NET_N - 1],
		[NET_N - 1, 0],
		[NET_N - 1, NET_N - 1],
	]) {
		const pos = at(i, j);
		const q = project(cam, pos);
		if (!q) continue;
		const tail = speed > 0.05 ? project(cam, madd(pos, F, -0.5 * speed)) : null;
		const r = Math.min(4, Math.max(1.6, (0.04 * cam.fpx) / q.z));
		items.push({
			z: q.z - 0.01,
			draw: () => {
				if (tail) {
					const g = ctx.createLinearGradient(tail.x, tail.y, q.x, q.y);
					g.addColorStop(0, css(pal.text, 0));
					g.addColorStop(1, css(pal.text, 0.6));
					ctx.strokeStyle = g;
					ctx.lineWidth = r * 1.4;
					ctx.lineCap = "round";
					ctx.beginPath();
					ctx.moveTo(tail.x, tail.y);
					ctx.lineTo(q.x, q.y);
					ctx.stroke();
				}
				ctx.fillStyle = css([58, 62, 70]);
				ctx.strokeStyle = css(pal.dark ? [200, 208, 220] : [20, 22, 26], 0.8);
				ctx.lineWidth = 0.8;
				ctx.beginPath();
				ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			},
		});
	}
}

/* ---- Разметка ------------------------------------------------------------- */

function drawOverlay(
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	pal: Palette,
	o: {
		p1: number;
		t: number;
		time: number;
		dronePos: Vec;
		muzzle: Vec;
		w: number;
		h: number;
	},
) {
	const { p1, t, time, dronePos, muzzle, w, h } = o;
	const fired = t >= 0;
	const tc = t - T_HIT;
	const floor = h - 46;
	ctx.font = `500 9.5px ${pal.font}`;
	ctx.textBaseline = "alphabetic";

	// Линия визирования — «бегущий» пунктир от дульного среза к цели.
	const sight = smooth(0.25, 0.6, p1) * (fired ? 1 - smooth(0, 0.05, t) : 1);
	if (sight > 0.01) {
		const seg = projectSeg(cam, muzzle, dronePos);
		if (seg) {
			ctx.save();
			ctx.setLineDash([3, 5]);
			ctx.lineDashOffset = -time * 18;
			ctx.strokeStyle = css(pal.accent, 0.85 * sight);
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(seg[0].x, seg[0].y);
			ctx.lineTo(seg[1].x, seg[1].y);
			ctx.stroke();
			ctx.restore();
		}
	}

	// Траектория центра сети прочерчивается вслед за полётом.
	const trace = fired ? 1 - smooth(0.1, 0.7, tc) : 0;
	if (trace > 0.01) {
		ctx.save();
		ctx.setLineDash([2, 4]);
		ctx.strokeStyle = css(pal.primary, 0.75 * trace);
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		const end = Math.min(t, T_HIT);
		let started = false;
		for (let k = 0; k <= 40; k += 1) {
			const q = project(cam, netCenter((end * k) / 40));
			if (!q) continue;
			if (started) ctx.lineTo(q.x, q.y);
			else ctx.moveTo(q.x, q.y);
			started = true;
		}
		ctx.stroke();
		ctx.restore();
	}

	// Рамка цели: сходится от широкой к плотной — тот же жест, что у
	// угловых меток .reticle на карточках сайта.
	const dq = project(cam, dronePos);
	const frame = smooth(0.12, 0.35, p1) * (fired ? 1 - smooth(0, 0.08, t) : 1);
	if (dq && frame > 0.01) {
		const lock = smooth(0.55, 0.92, p1);
		const size = (0.5 * cam.fpx) / dq.z + lerp(34, 9, easeOut(lock));
		const color = lock >= 1 ? pal.primary : pal.accent;
		const arm = 7;
		ctx.strokeStyle = css(color, frame);
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		for (const [sx, sy] of [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1],
		]) {
			const x = dq.x + sx * size;
			const y = dq.y + sy * size;
			ctx.moveTo(x, y - sy * arm);
			ctx.lineTo(x, y);
			ctx.lineTo(x - sx * arm, y);
		}
		ctx.stroke();
		const dist = len(sub(dronePos, PIVOT));
		ctx.fillStyle = css(color, frame);
		ctx.textAlign = "left";
		ctx.fillText(
			lock >= 1 ? "ЦЕЛЬ" : "ПОИСК",
			dq.x - size,
			Math.max(14, dq.y - size - 6),
		);
		ctx.fillStyle = css(pal.text, frame);
		ctx.fillText(
			`${dist.toFixed(1)} м`,
			dq.x - size,
			Math.min(floor, dq.y + size + 13),
		);
	}

	// Площадь раскрытия — когда сеть уже квадрат, а до цели ещё не дошла.
	const area = smooth(0.24, 0.34, t) * (1 - smooth(-0.04, 0.02, tc));
	if (area > 0.01) {
		const nc = project(
			cam,
			madd(netCenter(Math.min(t, T_HIT)), UP, NET_HALF + 0.25),
		);
		if (nc) {
			ctx.textAlign = "center";
			ctx.fillStyle = css(pal.primary, area);
			ctx.fillText("5.7 м²", nc.x, Math.max(14, nc.y));
		}
	}

	// Прогнозируемая зона падения появляется сразу после захвата.
	const zone = fired ? smooth(0, 0.25, tc) : 0;
	if (zone > 0.01) {
		ctx.save();
		ctx.setLineDash([4, 4]);
		ctx.lineDashOffset = time * 8;
		ctx.strokeStyle = css(pal.primary, 0.75 * zone);
		ctx.fillStyle = css(pal.primary, 0.07 * zone);
		ctx.lineWidth = 1;
		ctx.beginPath();
		let top: Pt | null = null;
		for (let i = 0; i <= 36; i += 1) {
			const a = (i / 36) * Math.PI * 2;
			const q = project(cam, [
				LANDING[0] + Math.cos(a) * 1.5 * zone,
				0.01,
				LANDING[2] + Math.sin(a) * 1.1 * zone,
			]);
			if (!q) continue;
			if (!top || q.y < top.y) top = q;
			ctx.lineTo(q.x, q.y);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.restore();
		const label = project(cam, [LANDING[0] + 1.6, 0.01, LANDING[2] - 1.2]);
		if (label) {
			ctx.textAlign = "left";
			ctx.fillStyle = css(pal.primary, zone);
			ctx.fillText(
				"зона падения",
				Math.min(w - 80, label.x),
				Math.min(floor, label.y),
			);
		}
	}

	// Таймер от выстрела — «между первым и третьим тактом — секунды».
	if (fired) {
		ctx.textAlign = "right";
		ctx.fillStyle = css(pal.text, 1);
		ctx.fillText(`${Math.min(t, T_HIT + T_CAPTURE).toFixed(2)} с`, w - 14, 22);
		const value = ctx.measureText("0.00 с").width;
		ctx.fillStyle = css(pal.muted, 1);
		ctx.fillText("T+", w - 18 - value, 22);
	}
}

/* ========================================================================== */
/* Жизненный цикл                                                             */
/* ========================================================================== */

export interface InterceptScene {
	setProgress: (p: number) => void;
	destroy: () => void;
}

/**
 * Монтирует сцену на canvas. Цикл отрисовки крутится только пока схема
 * видна и вкладка активна; при prefers-reduced-motion рисуется один
 * статичный кадр с итогом — аппарат в сети, как и раньше.
 */
export function createInterceptScene(
	canvas: HTMLCanvasElement,
	{ probe, fontSource }: { probe: HTMLElement; fontSource: HTMLElement },
): InterceptScene {
	const ctx = canvas.getContext("2d");
	if (!ctx) return { setProgress: () => {}, destroy: () => {} };

	const reduceMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	let pal = readPalette(probe, fontSource);
	let sprites = {
		smoke: makeSprite(pal.dark ? [120, 128, 140] : [110, 116, 126]),
		dust: makeSprite(pal.muted),
	};
	const state: FrameState = {
		p: reduceMotion ? 1 : 0,
		time: 0,
		spin: 0,
		w: 0,
		h: 0,
	};
	let target = state.p;
	let visible = false;
	let frame = 0;
	let last = 0;

	const draw = () => {
		if (!state.w || !state.h) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		render(ctx, pal, sprites, state);
	};

	const tick = (now: number) => {
		frame = 0;
		const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
		last = now;
		state.time += dt;
		// Сглаживание прокрутки: колесо мыши двигает страницу ступенями,
		// схема догоняет их плавно, без рывков между кадрами.
		const diff = target - state.p;
		state.p =
			Math.abs(diff) < 0.0004
				? target
				: state.p + diff * (1 - Math.exp(-dt * 9));
		state.spin += dt * 70 * rotorSpeed(state.p);
		draw();
		schedule();
	};

	const schedule = () => {
		if (reduceMotion || !visible || frame || document.hidden) return;
		frame = requestAnimationFrame(tick);
	};

	const resize = () => {
		const rect = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		state.w = rect.width;
		state.h = rect.height;
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		draw();
	};

	const retheme = () => {
		pal = readPalette(probe, fontSource);
		sprites = {
			smoke: makeSprite(pal.dark ? [120, 128, 140] : [110, 116, 126]),
			dust: makeSprite(pal.muted),
		};
		draw();
	};

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(canvas);

	const io = new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			last = 0;
			schedule();
		},
		{ rootMargin: "10% 0px" },
	);
	io.observe(canvas);

	// Тема меняется атрибутом data-scheme на <html> или системной настройкой.
	const themeObserver = new MutationObserver(retheme);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-scheme", "class"],
	});
	const scheme = window.matchMedia("(prefers-color-scheme: dark)");
	scheme.addEventListener("change", retheme);

	const onVisibility = () => {
		last = 0;
		schedule();
	};
	document.addEventListener("visibilitychange", onVisibility);

	resize();

	return {
		setProgress(p) {
			if (reduceMotion) return;
			target = p;
			schedule();
		},
		destroy() {
			if (frame) cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			io.disconnect();
			themeObserver.disconnect();
			scheme.removeEventListener("change", retheme);
			document.removeEventListener("visibilitychange", onVisibility);
		},
	};
}
