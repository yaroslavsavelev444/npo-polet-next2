/**
 * Сеткомёт FPV: пусковое устройство на перехватчике.
 *
 *  1. Студия — площадка садится на раму и крепится четырьмя винтами M3×16,
 *     снаряд накручивается на трубку, плата инициации получает +5 В.
 *  2. Поле — перехватчик догоняет цель над лесом; в окне «вид из очков
 *     пилота» видно, как цель приближается. На рабочей дистанции 4–6 м —
 *     пуск тумблером, сеть раскрывается перед целью, цель падает,
 *     перехватчик уходит вверх.
 */

import * as THREE from "three";
import type { ShowcaseProduct } from "../../content/showcase-content";
import type { FrameContext, ShowcaseScene } from "../engine";
import {
	disposeTree,
	easeInOut,
	easeOut,
	seg,
	smooth,
	track,
	v3,
	windowed,
} from "../kit";
import { makeFpvInterceptor, makeTargetDrone } from "../models";
import {
	bagRadii,
	Dust,
	makeFall,
	makeField,
	makeStudio,
	ShotRig,
} from "./common";

const H = 0.3;
const TURN = (Math.PI * 2) / 3;
const SCALE = 1.6;
const SPEED = 7;
const ALT = 6;

export function fpvScene(product: ShowcaseProduct): ShowcaseScene {
	const [s0, s1, s2] = product.steps;
	const studioEnd = s1.start;
	const finale = product.finale.start;

	/* ===================================================================== */
	/* Студия                                                                */
	/* ===================================================================== */

	const studio = makeStudio(0.25);
	const rig = makeFpvInterceptor();
	rig.group.position.set(0, H, 0);
	studio.scene.add(rig.group);
	rig.launcher.add(rig.projectile.group);
	const socketLocal = rig.socket.position.clone();
	const mountAt = s0.start + s0.hold;
	const screwsAt = mountAt + 1;
	const projAt = screwsAt + 0.8;
	const screwAt = projAt + 0.7;
	const powerAt = screwAt + 0.6;

	const studioCam = track([
		[0, v3(0.8, H + 0.46, 0.92)],
		[product.introEnd, v3(0.66, H + 0.38, 0.74)],
		[mountAt, v3(0.48, H + 0.34, 0.52)],
		[projAt, v3(0.42, H + 0.18, 0.6)],
		[powerAt, v3(-0.44, H + 0.26, 0.42)],
		[studioEnd, v3(-0.5, H + 0.3, 0.56)],
	]);
	const studioAt = track([
		[0, v3(0, H, 0)],
		[mountAt, v3(0, H + 0.03, 0)],
		[projAt, v3(0, H + 0.04, 0.08)],
		[powerAt, v3(0, H + 0.02, -0.03)],
		[studioEnd, v3(0, H + 0.02, 0)],
	]);

	/* ===================================================================== */
	/* Поле                                                                  */
	/* ===================================================================== */

	const field = makeField({
		seed: 31,
		trees: 170,
		clear: 12,
		zMin: -20,
		zMax: 260,
		fogFar: 120,
	});
	const hunter = makeFpvInterceptor();
	hunter.launcher.add(hunter.projectile.group);
	hunter.projectile.group.position.copy(socketLocal).add(v3(0, 0, -0.012));
	hunter.projectile.group.rotation.z = TURN;
	hunter.group.scale.setScalar(SCALE);
	field.scene.add(hunter.group);
	const target = makeTargetDrone();
	target.group.scale.setScalar(SCALE);
	field.scene.add(target.group);

	const shotAt = s2.start + s2.hold;
	const flight = 1.0;
	const hitAt = shotAt + flight;
	const zAt = (t: number) => 26 + SPEED * (t - studioEnd);
	/** Дистанция до цели: 24 м → 5 м к концу погони. */
	const gapAt = (t: number) =>
		24 - 19 * easeInOut(seg(t, s1.start + s1.hold * 0.5, s2.start - 0.2));

	function targetPath(t: number, out: THREE.Vector3) {
		return out.set(
			0.6 * Math.sin(t * 0.7),
			ALT + 0.3 * Math.sin(t * 1.3),
			zAt(t) + 5,
		);
	}
	function hunterPath(t: number, out: THREE.Vector3) {
		const tt = Math.min(t, hitAt);
		targetPath(tt, out);
		out.z = zAt(tt) + 5 - gapAt(tt);
		out.y -= 0.4;
		out.x *= 0.6;
		if (t > hitAt) {
			// Отвал: тормозит и уходит вверх.
			const k = t - hitAt;
			out.z += SPEED * 1.6 * (1 - Math.exp(-k / 1.6));
			out.y += 4 * easeOut(seg(k, 0, 3));
		}
		return out;
	}
	const pose = new THREE.Object3D();
	function poseHunter(t: number) {
		hunterPath(t, pose.position);
		const climb = t > hitAt ? 0.5 * windowed(t - hitAt, 0, 3, 0.6) : 0;
		pose.rotation.set(0.35 - climb, 0, 0.08 * Math.sin(t * 0.9));
		return pose;
	}
	// Выстрел: из трубки перехватчика в точку встречи с целью.
	poseHunter(shotAt);
	hunter.group.position.copy(pose.position);
	hunter.group.rotation.copy(pose.rotation);
	field.scene.updateMatrixWorld(true);
	const muzzle = hunter.socket.getWorldPosition(v3()).add(v3(0, 0, 0.18));
	const meet = targetPath(hitAt, v3());
	const dir = meet.clone().sub(muzzle).normalize();
	const shot = new ShotRig(
		field.scene,
		shotAt,
		{ muzzle, target: meet.clone().addScaledVector(dir, -0.35), flight },
		1.7,
	);
	const fall = makeFall(meet, v3(0, 0, 1), { push: 4, rest: 0.26, spin: 1.1 });
	const dust = new Dust();
	field.scene.add(dust.group);
	const pipCam = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 300);

	const offset = track([
		[studioEnd, v3(-2.6, 1.3, -4.2)],
		[s1.start + s1.hold, v3(-2.2, 1.0, -3.4)],
		[shotAt - 0.3, v3(-3.6, 0.8, -3)],
		[shotAt + 0.4, v3(-8, 1.2, 0.5)],
		[hitAt + 0.6, v3(-8.5, 1.8, -0.5)],
	]);
	const landing = fall.landing;
	const wideCam = track([
		[hitAt + 0.6, landing.clone().add(v3(-6, 4.5, -4))],
		[finale, landing.clone().add(v3(-5, 2.6, -5.5))],
		[product.duration, landing.clone().add(v3(-8, 8, -9))],
	]);

	/* ===================================================================== */
	/* Кадр                                                                  */
	/* ===================================================================== */

	const facing = new THREE.Quaternion();
	const result: ShowcaseScene = {
		scene: studio.scene,
		zero: shotAt,
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
		rig.group.position.y = H + 0.004 * Math.sin(time * 1.2);
		rig.group.rotation.y =
			0.25 * Math.sin(time * 0.2) + 0.3 * (1 - seg(t, 0, mountAt));
		rig.spin(0, 0);
		// Площадка опускается на раму.
		const m = easeInOut(seg(t, mountAt, mountAt + 0.9));
		rig.launcher.position.y = 0.02 + 0.14 * (1 - m);
		// Винты по одному загораются.
		rig.screws.forEach((sp, i) => {
			const k = smooth(screwsAt + i * 0.15, screwsAt + i * 0.15 + 0.2, t);
			(sp as THREE.Sprite).material.opacity = 0.3 + 0.7 * k;
			sp.scale.setScalar(
				0.012 +
					0.012 *
						windowed(t, screwsAt + i * 0.15, screwsAt + i * 0.15 + 0.5, 0.15),
			);
		});
		// Снаряд: подлёт к трубке, затем 1/3 оборота.
		const p = rig.projectile.group;
		const a = easeInOut(seg(t, projAt, screwAt));
		const s = easeInOut(seg(t, screwAt, screwAt + 0.5));
		p.position
			.copy(socketLocal)
			.add(v3(0, 0.06 * (1 - a), 0.22 * (1 - a) - 0.004 - 0.008 * s));
		p.rotation.set(0, 0, TURN * s);
		// Провод платы светится, когда подано питание.
		const power = smooth(powerAt, powerAt + 0.4, t);
		(rig.wire.material as THREE.MeshBasicMaterial).opacity =
			0.25 + 0.75 * power;

		rig.group.updateMatrixWorld(true);
		ctx.label(
			"m3",
			"M3×16",
			rig.screws[0].getWorldPosition(v3()),
			windowed(t, screwsAt, projAt + 0.2, 0.25),
			{
				sub: "4 винта",
			},
		);
		ctx.label(
			"thread",
			"на резьбу",
			rig.socket.getWorldPosition(v3()),
			windowed(t, projAt + 0.3, powerAt, 0.25),
			{
				sub: "снаряд · 1/3 оборота",
			},
		);
		ctx.label(
			"power",
			"+5 В",
			rig.board.getWorldPosition(v3()),
			windowed(t, powerAt, studioEnd - 0.1, 0.25),
			{
				sub: "плата инициации",
				accent: true,
			},
		);
		ctx.label(
			"net",
			"сеть 5,7 м²",
			rig.projectile.front.getWorldPosition(v3()),
			windowed(t, s0.start + 0.4, mountAt - 0.1, 0.3),
			{
				sub: "в снаряде",
				accent: true,
			},
		);
		ctx.look(studioCam(t), studioAt(t), 34);
	}

	function updateField(ctx: FrameContext) {
		const { t, time } = ctx;
		const hitT = t - hitAt;
		const caught = hitT >= 0;
		/* ---- Перехватчик ---- */
		poseHunter(t);
		hunter.group.position.copy(pose.position);
		hunter.group.rotation.copy(pose.rotation);
		hunter.spin(time * 70, 1);
		hunter.projectile.packed.visible = t < shotAt;

		/* ---- Цель ---- */
		const st = fall.state(hitT);
		if (!caught) {
			targetPath(t, target.group.position);
			facing.setFromEuler(new THREE.Euler(0.3, 0, 0.1 * Math.sin(t * 1.2)));
			target.group.quaternion.copy(facing);
		} else {
			target.group.position.copy(st.pos);
			target.group.quaternion.copy(st.turn);
		}
		const rotor = 1 - smooth(0, 0.6, hitT);
		target.spin(time * 60, rotor);

		/* ---- Выстрел ---- */
		const state = shot.update(
			t,
			caught
				? {
						center: target.group.position,
						turn: st.turn,
						radii: bagRadii(0.42 * SCALE),
					}
				: null,
		);
		const zoneK = smooth(hitAt + 0.6, hitAt + 1.4, t);
		shot.zone.group.position.set(landing.x, 0.02, landing.z);
		shot.zone.set(zoneK, 0.6 + 0.4 * zoneK, time);
		dust.update(hitT - fall.landAfter, landing);
		if (t > shotAt && t < shotAt + 0.6)
			ctx.shake(0.05 * Math.exp(-(t - shotAt) / 0.12));

		/* ---- Подписи ---- */
		const gap = target.group.position.distanceTo(hunter.group.position);
		const inRange = gap <= 6.2;
		ctx.label(
			"gap",
			inRange ? "4–6 м" : `${gap.toFixed(1)} м`,
			target.group.position,
			windowed(t, s1.start + 0.4, shotAt, 0.3) * (caught ? 0 : 1),
			{
				sub: inRange ? "рабочая дистанция" : "до цели",
				accent: inRange,
			},
		);
		ctx.label(
			"toggle",
			"пуск",
			hunter.group.position,
			windowed(t, shotAt - 0.5, shotAt + 0.6, 0.2),
			{
				sub: "тумблер на пульте",
				accent: true,
				left: true,
			},
		);
		ctx.label(
			"area",
			"5,7 м²",
			shot.net.nodes[shot.net.nodes.length - 1],
			state.open,
			{
				sub: "площадь сети",
				accent: true,
			},
		);
		ctx.label(
			"zone",
			"зона падения",
			landing.clone().add(v3(1.3, 0, 0)),
			windowed(t, hitAt + fall.landAfter, finale + 0.6, 0.35),
			{
				sub: "прогнозируемая",
				accent: true,
			},
		);
		ctx.label(
			"away",
			"уходит вверх",
			hunter.group.position,
			windowed(t, hitAt + 0.8, finale - 0.6, 0.3),
			{
				sub: "перехватчик",
				left: true,
			},
		);

		/* ---- Вид из очков пилота ---- */
		pipCam.position.copy(hunter.group.position).add(v3(0, 0.12, 0.2));
		pipCam.lookAt(caught ? st.pos : target.group.position);
		ctx.pip(
			field.scene,
			pipCam,
			"Вид из очков пилота",
			windowed(t, s1.start + s1.hold, hitAt + 0.4, 0.35),
		);

		/* ---- Камера ---- */
		const chase = hunter.group.position.clone().add(offset(t));
		const look = hunter.group.position
			.clone()
			.lerp(target.group.position, 0.55);
		const toWide = smooth(hitAt + 0.3, hitAt + 1.6, t);
		const pos = chase.lerp(wideCam(t), toWide);
		const at = look.lerp(
			st.pos.clone().lerp(landing, smooth(hitAt + 1.4, finale, t)),
			toWide,
		);
		ctx.look(pos, at, 42);
	}

	return result;
}
