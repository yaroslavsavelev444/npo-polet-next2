/**
 * Общие куски сцен: поле с лесом, «выстрел» целиком (сеть + вспышка +
 * трасса + зона падения) и падение пойманного аппарата.
 *
 * Время везде — секунды ролика. Физика сети и падения растянута примерно
 * в SLOW раз: реальный полёт сети занимает доли секунды, в ролике он
 * показан замедленно, как в утверждённых видео.
 */

import * as THREE from "three";
import {
	COLORS,
	clamp01,
	easeOut,
	getSoftTexture,
	hash,
	MuzzleFx,
	makeDropZone,
	makeTrace,
	makeTrees,
	makeWorld,
	NET_HALF,
	Net,
	type ShotSpec,
	smooth,
	solveNet,
	v3,
	type WrapSpec,
} from "../kit";

export const SLOW = 2.2;

/** Поле: земля, небо, туман, лес вокруг коридора полёта. */
export function makeField(opts: {
	seed: number;
	trees?: number;
	/** Коридор без деревьев: |x| < clear у полосы z от zMin до zMax. */
	clear?: number;
	zMin?: number;
	zMax?: number;
	fogNear?: number;
	fogFar?: number;
}) {
	const world = makeWorld({
		fogNear: opts.fogNear ?? 22,
		fogFar: opts.fogFar ?? 110,
	});
	const clear = opts.clear ?? 6;
	const trees = makeTrees(opts.trees ?? 90, opts.seed, (_i, rnd) => {
		const x = (rnd(1) - 0.5) * 120;
		const z =
			(opts.zMin ?? -30) + rnd(2) * ((opts.zMax ?? 110) - (opts.zMin ?? -30));
		if (Math.abs(x) < clear && z > -8) return null;
		return v3(x, 0, z);
	});
	world.scene.add(trees);
	return { ...world, trees };
}

/** Студия: близкая сетка под изделием, плотный туман по краям. */
export function makeStudio(scale = 0.25) {
	const world = makeWorld({ fogNear: 1.2, fogFar: 6.5 });
	world.ground.material.uniforms.uScale.value = scale;
	world.ground.material.uniforms.uFadeNear.value = 0.6;
	world.ground.material.uniforms.uFadeFar.value = 4;
	return world;
}

/* ========================================================================== */
/* Выстрел                                                                    */
/* ========================================================================== */

export interface ShotState {
	/** Сеть видна и летит/висит. */
	visible: boolean;
	/** Сеть раскрыта (для подписи «5,7 м²»). */
	open: number;
}

/**
 * Всё, что относится к одному выстрелу. Сцена задаёт параметры выстрела,
 * момент пуска и, после попадания, положение цели — остальное здесь.
 */
export class ShotRig {
	readonly net = new Net(12);
	readonly fx: MuzzleFx;
	readonly trace = makeTrace(COLORS.net, 1.3);
	readonly zone: ReturnType<typeof makeDropZone>;
	private readonly dir = new THREE.Vector3();
	private tracePoints: THREE.Vector3[] = [];

	constructor(
		scene: THREE.Scene,
		readonly at: number,
		readonly spec: ShotSpec,
		zoneRadius = 1.6,
		fxScale = 1,
	) {
		this.fx = new MuzzleFx(fxScale);
		this.zone = makeDropZone(zoneRadius);
		scene.add(this.net.group, this.fx.group, this.trace.line, this.zone.group);
		this.dir.subVectors(spec.target, spec.muzzle).normalize();
		// Трасса центра сети — тот же закон движения, что в solveNet.
		const pts: THREE.Vector3[] = [];
		for (let i = 0; i <= 30; i += 1) {
			pts.push(
				spec.muzzle
					.clone()
					.lerp(spec.target, easeOut(i / 30) * 0.98 + (i / 30) * 0.02),
			);
		}
		this.tracePoints = pts;
		this.trace.setPoints(pts);
	}

	update(
		t: number,
		wrap: WrapSpec | null,
		opts: { fade?: number; traceFade?: number } = {},
	): ShotState {
		const ts = t - this.at;
		this.fx.update(ts, this.spec.muzzle, this.dir, 0.6);
		if (ts < 0) {
			this.net.hide();
			this.trace.set(0, 0);
			return { visible: false, open: 0 };
		}
		solveNet(this.net.nodes, this.net.n, this.spec, ts, wrap);
		this.net.commit(opts.fade ?? 1);
		const flight = this.spec.flight;
		const drawn = clamp01(ts / flight);
		const traceAlpha =
			(1 - smooth(flight, flight + 1.2, ts)) * (opts.traceFade ?? 1) * 0.8;
		this.trace.set(traceAlpha, drawn);
		return {
			visible: true,
			open:
				smooth(flight * 0.3, flight * 0.55, ts) *
				(1 - smooth(flight, flight + 0.2, ts)),
		};
	}

	get points() {
		return this.tracePoints;
	}
}

/* ========================================================================== */
/* Падение пойманного аппарата                                                */
/* ========================================================================== */

export interface Fall {
	pos: THREE.Vector3;
	turn: THREE.Quaternion;
	landed: number;
	/** Точка приземления — центр зоны падения. */
	landing: THREE.Vector3;
}

/**
 * Пойманный аппарат: по инерции проходит вперёд, теряет тягу и падает,
 * кувыркаясь; на земле подпрыгивает и замирает. tc — секунды после
 * попадания.
 */
export function makeFall(
	start: THREE.Vector3,
	heading: THREE.Vector3,
	opts: { push?: number; rest?: number; spin?: number } = {},
) {
	const push = opts.push ?? 1.2;
	const rest = opts.rest ?? 0.32;
	const g = 9.81 / (SLOW * SLOW);
	const h = norm2(heading);
	const delay = 0.25;
	const landAfter = Math.sqrt((2 * Math.max(0.01, start.y - rest)) / g) + delay;
	const pos = new THREE.Vector3();
	const turn = new THREE.Quaternion();
	const euler = new THREE.Euler();
	const at = (tc: number, out: THREE.Vector3) => {
		const fwd = push * (1 - Math.exp(-Math.min(tc, landAfter) / 0.5));
		out.copy(start).addScaledVector(h, fwd);
		const tf = Math.max(0, tc - delay);
		let y = start.y - 0.5 * g * tf * tf;
		if (tc >= landAfter) {
			const k = tc - landAfter;
			y = rest + 0.25 * Math.exp(-k / 0.25) * Math.abs(Math.sin(k * 9));
		}
		out.y = Math.max(rest, y);
		return out;
	};
	const landing = at(landAfter + 10, new THREE.Vector3());
	landing.y = 0;
	return {
		landAfter,
		landing,
		/** Состояние на tc секунд после попадания (tc < 0 — ещё летит сам). */
		state(tc: number): Fall {
			at(Math.max(0, tc), pos);
			const fall = smooth(0, landAfter, tc);
			const wob =
				Math.sin(tc * 3.4) *
				0.18 *
				(1 - smooth(landAfter, landAfter + 0.6, tc));
			euler.set(
				-0.5 * fall + wob,
				(opts.spin ?? 0.6) * fall,
				0.7 * fall - wob * 0.5,
			);
			turn.setFromEuler(euler);
			return { pos, turn, landed: tc >= landAfter ? 1 : 0, landing };
		},
	};
}

function norm2(v: THREE.Vector3) {
	const h = new THREE.Vector3(v.x, 0, v.z);
	if (h.lengthSq() < 1e-6) return h.set(0, 0, 0);
	return h.normalize();
}

/** Полуоси мешка сети вокруг аппарата размахом span. */
export function bagRadii(span: number) {
	return new THREE.Vector3(span * 0.55, span * 0.32, span * 0.48);
}

/** Пыль от удара о землю: несколько мягких спрайтов. */
export class Dust {
	readonly group = new THREE.Group();
	private readonly sprites: THREE.Sprite[] = [];
	constructor(count = 10) {
		const mat = new THREE.SpriteMaterial({
			map: getSoftTexture(),
			color: new THREE.Color(0x4a5568),
			transparent: true,
			opacity: 0,
			depthWrite: false,
		});
		for (let i = 0; i < count; i += 1) {
			const s = new THREE.Sprite(mat.clone());
			this.sprites.push(s);
			this.group.add(s);
		}
	}
	update(since: number, at: THREE.Vector3) {
		const life = 1.6;
		this.group.visible = since > 0 && since < life;
		if (!this.group.visible) return;
		this.sprites.forEach((s, i) => {
			const a = (i / this.sprites.length) * Math.PI * 2 + hash(i) * 0.6;
			const r =
				0.2 + 1.1 * (1 - Math.exp(-since / 0.35)) * (0.6 + 0.4 * hash(i + 4));
			s.position.set(
				at.x + Math.cos(a) * r,
				0.08 + 0.3 * since * hash(i + 8),
				at.z + Math.sin(a) * r,
			);
			s.scale.setScalar(0.25 + 0.5 * since);
			(s.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - since / life);
		});
	}
}

export { NET_HALF };
