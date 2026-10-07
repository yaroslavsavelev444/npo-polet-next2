/**
 * Вултур R10: дрон-перехватчик с двумя сеткомётами.
 *
 *  1. Студия — платформа и её характеристики по одной (скорость, время
 *     полёта, радиус, нагрузка), затем сверху и снизу встают сеткомёты.
 *  2. Поле — перехватчик гонится за двумя целями над лесом. Нижний
 *     сеткомёт ловит первую, верхний — вторую: два перехвата за вылет.
 */

import * as THREE from "three";
import type { ShowcaseProduct } from "../../content/showcase-content";
import type { FrameContext, ShowcaseScene } from "../engine";
import {
	disposeTree,
	easeIn,
	easeInOut,
	easeOut,
	seg,
	smooth,
	track,
	v3,
	windowed,
} from "../kit";
import { makeTargetDrone, makeVultur, type VulturMount } from "../models";
import {
	bagRadii,
	Dust,
	makeFall,
	makeField,
	makeStudio,
	ShotRig,
} from "./common";

const H = 0.6;
const SPEED = 9;
const TARGET_SCALE = 1.7;
const TURN = (Math.PI * 2) / 3;

export function vulturScene(product: ShowcaseProduct): ShowcaseScene {
	const [s0, s1, s2, s3, s4] = product.steps;
	const studioEnd = s2.start;
	const finale = product.finale.start;

	/* ===================================================================== */
	/* Студия                                                                */
	/* ===================================================================== */

	const studio = makeStudio(0.5);
	studio.ground.material.uniforms.uFadeFar.value = 7;
	studio.scene.fog = new THREE.Fog(0x0a111d, 2.5, 12);
	const r10 = makeVultur();
	r10.group.position.set(0, H, 0);
	studio.scene.add(r10.group);
	const facts = s0.start + s0.hold;
	const topAt = s1.start + s1.hold;
	const bottomAt = topAt + 1.35;

	const studioCam = track([
		[0, v3(2.3, H + 1.0, 2.5)],
		[product.introEnd, v3(1.8, H + 0.7, 2.1)],
		[facts, v3(0.9, H + 0.35, 1.5)],
		[facts + 1.4, v3(-0.6, H + 0.5, 1.6)],
		[facts + 2.8, v3(-1.3, H + 1.0, 0.7)],
		[facts + 4.0, v3(1.7, H + 0.6, 1.1)],
		[s1.start, v3(1.9, H + 0.35, 1.7)],
		[topAt, v3(0.78, H + 0.42, 0.9)],
		[bottomAt, v3(0.8, H - 0.02, 0.98)],
		[bottomAt + 1.5, v3(0.95, H + 0.04, 1.15)],
		[studioEnd, v3(2, H + 0.25, 1.9)],
	]);
	const studioAt = track([
		[0, v3(0, H, 0)],
		[facts, v3(0, H, 0.15)],
		[facts + 1.4, v3(0, H + 0.08, -0.05)],
		[facts + 2.8, v3(0.05, H + 0.25, -0.12)],
		[facts + 4.0, v3(0.2, H, 0.2)],
		[s1.start, v3(0, H, 0)],
		[topAt, v3(0, H + 0.14, 0)],
		[bottomAt, v3(0, H - 0.05, 0.2)],
		[bottomAt + 1.5, v3(0, H + 0.02, 0.05)],
		[studioEnd, v3(0, H, 0)],
	]);

	/* ===================================================================== */
	/* Поле                                                                  */
	/* ===================================================================== */

	const field = makeField({
		seed: 59,
		trees: 200,
		clear: 9,
		zMin: -20,
		zMax: 320,
		fogFar: 130,
	});
	const hunter = makeVultur();
	for (const m of hunter.mounts) mountLoaded(m);
	field.scene.add(hunter.group);
	const targets = [makeTargetDrone(), makeTargetDrone()];
	for (const tg of targets) {
		tg.group.scale.setScalar(TARGET_SCALE);
		field.scene.add(tg.group);
	}

	const shots = [
		{ at: s3.start + s3.hold + 0.2, flight: 0.9, launcher: "bottom" as const },
		{ at: s4.start + s4.hold + 0.2, flight: 0.9, launcher: "top" as const },
	];
	const hits = shots.map((s) => s.at + s.flight);
	const zAt = (t: number) => 20 + SPEED * (t - studioEnd);

	/** Цели летят впереди; дистанция сокращается к моменту выстрела. */
	function targetPath(i: number, t: number, out: THREE.Vector3) {
		const tt = Math.min(t, hits[i]);
		const gap =
			i === 0
				? 18 - 13 * easeInOut(seg(tt, s2.start + s2.hold * 0.5, s3.start + 0.2))
				: 26 - 21 * easeInOut(seg(tt, hits[0] + 0.4, s4.start + 0.3));
		out.set(
			i === 0 ? 0.4 * Math.sin(tt * 0.9) : 3.2 + 0.4 * Math.sin(tt * 0.8),
			(i === 0 ? 6.6 : 9.6) + 0.25 * Math.sin(tt * 1.4 + i),
			zAt(tt) + gap,
		);
		return out;
	}
	function hunterPath(t: number, out: THREE.Vector3) {
		const side = easeInOut(seg(t, hits[0] + 0.3, s4.start + 0.2));
		const lift = easeInOut(seg(t, hits[0] + 0.3, s4.start + 0.2));
		out.set(0.1 * Math.sin(t * 0.6) + 3 * side, 7.4 + 1.8 * lift, zAt(t));
		if (t > hits[1]) out.y += 3 * easeOut(seg(t - hits[1], 0, 3));
		return out;
	}
	const rigs = shots.map((s, i) => {
		hunterPath(s.at, hunter.group.position);
		hunter.group.rotation.set(0.12, 0, 0);
		field.scene.updateMatrixWorld(true);
		const from = (
			s.launcher === "top" ? hunter.top : hunter.bottom
		).getWorldPosition(v3());
		const meet = targetPath(i, hits[i], v3());
		const dir = meet.clone().sub(from).normalize();
		const rig = new ShotRig(
			field.scene,
			s.at,
			{
				muzzle: from,
				target: meet.clone().addScaledVector(dir, -0.35),
				flight: s.flight,
			},
			1.6,
		);
		const fall = makeFall(meet, v3(0, 0, 1), {
			push: 5,
			rest: 0.26,
			spin: 1.2,
		});
		return { ...s, rig, fall };
	});
	const dust = [new Dust(), new Dust()];
	for (const d of dust) field.scene.add(d.group);

	const offset = track([
		[studioEnd, v3(-5, 2.2, -7)],
		[s2.start + s2.hold, v3(-4, 1.4, -5)],
		[shots[0].at - 0.2, v3(-5.5, 0.4, -1)],
		[hits[0] + 0.8, v3(-6, 1.2, -3)],
		[shots[1].at - 0.2, v3(-6, 2.2, 0)],
		[hits[1] + 0.8, v3(-7, 2.4, -3)],
		[finale, v3(-9, 4, -10)],
		[product.duration, v3(-12, 7, -15)],
	]);

	/* ===================================================================== */
	/* Кадр                                                                  */
	/* ===================================================================== */

	const result: ShowcaseScene = {
		scene: studio.scene,
		zero: shots[0].at,
		update(ctx: FrameContext) {
			ctx.fade(windowed(ctx.t, studioEnd - 0.4, studioEnd + 0.4, 0.4));
			if (ctx.t < studioEnd) {
				result.scene = studio.scene;
				updateStudio(ctx);
			} else {
				result.scene = field.scene;
				updateField(ctx);
			}
		},
		dispose() {
			disposeTree(studio.scene);
			disposeTree(field.scene);
		},
	};

	function updateStudio(ctx: FrameContext) {
		const { t, time } = ctx;
		r10.group.position.y = H + 0.01 * Math.sin(time * 1.1);
		r10.group.rotation.y = 0.15 * Math.sin(time * 0.15);
		r10.spin(time * 40, 0.9);
		// Сначала снимаются заглушки, затем снаряды накручиваются на втулки.
		mountState(r10.mounts[0], t, topAt);
		mountState(r10.mounts[1], t, bottomAt);
		r10.group.updateMatrixWorld(true);
		const nose = r10.group.localToWorld(v3(0, 0, 0.2));
		const facts4: Array<[string, string, string, THREE.Vector3, number]> = [
			["speed", "до 140 км/ч", "скорость", nose, facts],
			[
				"time",
				"до 40 мин",
				"полёт",
				r10.battery.getWorldPosition(v3()),
				facts + 1.4,
			],
			[
				"range",
				"10 км",
				"радиус",
				r10.antenna.getWorldPosition(v3()),
				facts + 2.8,
			],
			[
				"load",
				"3,5 кг",
				"нагрузка",
				r10.arm.getWorldPosition(v3()),
				facts + 4.0,
			],
		];
		for (const [key, text, sub, at, from] of facts4) {
			ctx.label(key, text, at, windowed(t, from, from + 1.4, 0.25), {
				sub,
				large: true,
			});
		}
		r10.mounts.forEach((m, i) => {
			const at = i === 0 ? topAt : bottomAt;
			const socket = m.socket.getWorldPosition(v3());
			ctx.label(
				`cap-${i}`,
				"заглушка",
				socket,
				windowed(t, at - 0.1, at + 0.75, 0.2),
				{
					sub: i === 0 ? "сверху · снять" : "снизу · снять",
					left: i === 0,
				},
			);
			ctx.label(
				`thread-${i}`,
				"на резьбу",
				m.mouth.getWorldPosition(v3()),
				windowed(t, at + 0.95, at + 1.9, 0.2),
				{
					sub: "снаряд",
					accent: true,
					left: i === 0,
				},
			);
		});
		ctx.label(
			"two",
			"2 выстрела",
			r10.group.localToWorld(v3(-0.3, 0.1, 0)),
			windowed(t, bottomAt + 1.5, studioEnd - 0.05, 0.15),
			{
				sub: "двухзарядная сеть",
				accent: true,
				left: true,
			},
		);
		ctx.look(studioCam(t), studioAt(t), 36);
	}

	function updateField(ctx: FrameContext) {
		const { t, time } = ctx;
		hunterPath(t, hunter.group.position);
		hunter.group.rotation.set(
			0.12 - 0.3 * (t > hits[1] ? smooth(hits[1], hits[1] + 1, t) : 0),
			0,
			0.05 * Math.sin(t * 0.7),
		);
		hunter.spin(time * 60, 1);
		// Нижний сеткомёт стреляет первым, верхний — вторым.
		hunter.mounts[1].packed.visible = t < shots[0].at;
		hunter.mounts[0].packed.visible = t < shots[1].at;

		rigs.forEach((r, i) => {
			const tg = targets[i];
			const hitT = t - hits[i];
			const caught = hitT >= 0;
			const st = r.fall.state(hitT);
			if (!caught) {
				targetPath(i, t, tg.group.position);
				tg.group.rotation.set(0.3, 0, 0.1 * Math.sin(t + i));
			} else {
				tg.group.position.copy(st.pos);
				tg.group.quaternion.copy(st.turn);
			}
			tg.spin(time * 60, 1 - smooth(0, 0.6, hitT));
			const state = r.rig.update(
				t,
				caught
					? {
							center: tg.group.position,
							turn: st.turn,
							radii: bagRadii(0.42 * TARGET_SCALE),
						}
					: null,
			);
			const zoneK = smooth(hits[i] + 0.6, hits[i] + 1.4, t);
			r.rig.zone.group.position.set(r.fall.landing.x, 0.02, r.fall.landing.z);
			r.rig.zone.set(zoneK, 0.6 + 0.4 * zoneK, time);
			dust[i].update(hitT - r.fall.landAfter, r.fall.landing);
			if (t > r.at && t < r.at + 0.6)
				ctx.shake(0.05 * Math.exp(-(t - r.at) / 0.12));
			ctx.label(
				`area-${i}`,
				"5,7 м²",
				r.rig.net.nodes[r.rig.net.nodes.length - 1],
				state.open,
				{
					sub: i === 0 ? "нижний сеткомёт" : "верхний сеткомёт",
					accent: true,
				},
			);
			const gap = tg.group.position.distanceTo(hunter.group.position);
			const chaseFrom = i === 0 ? s2.start + 0.4 : hits[0] + 0.6;
			ctx.label(
				`gap-${i}`,
				gap <= 6.2 ? "4–6 м" : `${gap.toFixed(1)} м`,
				tg.group.position,
				windowed(t, chaseFrom, r.at, 0.3) * (caught ? 0 : 1),
				{
					sub: i === 0 ? "цель 1" : "цель 2",
					accent: gap <= 6.2,
				},
			);
			ctx.label(
				`zone-${i}`,
				"зона падения",
				r.fall.landing.clone().add(v3(1.3, 0, 0)),
				windowed(
					t,
					hits[i] + r.fall.landAfter,
					hits[i] + r.fall.landAfter + 2.4,
					0.35,
				),
				{
					sub: "прогнозируемая",
					accent: true,
				},
			);
		});
		const kmh = Math.round(68 + 6 * seg(t, s2.start, s3.start));
		ctx.label(
			"kmh",
			`${kmh} км/ч`,
			hunter.group.position,
			windowed(t, s2.start + 0.3, shots[0].at - 0.2, 0.3),
			{
				sub: "скорость",
				left: true,
			},
		);

		const pos = hunter.group.position.clone().add(offset(t));
		const focus =
			t < hits[0] + 0.8 ? targets[0].group.position : targets[1].group.position;
		const at = hunter.group.position.clone().lerp(focus, 0.45);
		ctx.look(pos, at, 42);
	}

	return result;
}

/**
 * Гнездо в момент t: заглушка откручивается и улетает, затем снаряд
 * подходит по оси и накручивается на 1/3 оборота. from — начало операции.
 */
function mountState(m: VulturMount, t: number, from: number) {
	const unscrew = easeInOut(seg(t, from, from + 0.5));
	const away = easeIn(seg(t, from + 0.5, from + 0.8));
	m.cap.rotation.z = -TURN * unscrew;
	m.cap.position.z = 0.012 * unscrew + 0.25 * away;
	m.cap.scale.setScalar(Math.max(0.001, 1 - 0.6 * away));
	m.cap.visible = away < 0.98;
	const projAt = from + 0.75;
	const come = easeOut(seg(t, projAt, projAt + 0.5));
	const screw = easeInOut(seg(t, projAt + 0.5, projAt + 0.95));
	m.shell.visible = t >= projAt;
	m.shell.position.set(
		0,
		0.04 * (1 - come),
		0.3 * (1 - come) + 0.008 * (1 - screw),
	);
	m.shell.rotation.z = TURN * screw;
}

/** Снаряд на месте, заглушки сняты — так перехватчик вылетает. */
function mountLoaded(m: VulturMount) {
	m.cap.visible = false;
	m.shell.visible = true;
	m.shell.position.set(0, 0, 0);
	m.shell.rotation.z = TURN;
}
