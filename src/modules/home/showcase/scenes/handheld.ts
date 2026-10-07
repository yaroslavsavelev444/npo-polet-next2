/**
 * Ручные сеткомёты: «Паук 30БН» (один ствол) и «Паук Дуплет» (два).
 *
 * Две части, как в роликах:
 *  1. Студия — рукоять и снаряды-кассеты крупным планом; снаряд подлетает к
 *     дулу и накручивается на 1/3 оборота до щелчка.
 *  2. Поле — FPV-дрон заходит на оператора, оператор наводится, выстрел,
 *     сеть раскрывается и наматывается на винты, дрон падает в
 *     прогнозируемую зону. У Дуплета первый выстрел уходит мимо — дрон
 *     уклоняется, — второй ствол ловит его без перезарядки.
 *
 * Склейка между частями — короткое затемнение (ctx.fade).
 */

import * as THREE from "three";
import type { ShowcaseProduct } from "../../content/showcase-content";
import type { FrameContext, ShowcaseScene } from "../engine";
import {
	COLORS,
	disposeTree,
	easeInOut,
	glowSprite,
	makeDropZone,
	seg,
	smooth,
	track,
	v3,
	windowed,
} from "../kit";
import {
	makePistol,
	makeProjectile,
	makeTargetDrone,
	type Projectile,
} from "../models";
import {
	bagRadii,
	Dust,
	makeFall,
	makeField,
	makeStudio,
	ShotRig,
} from "./common";

const H = 0.32;
const TURN = (Math.PI * 2) / 3;
const DRONE_SCALE = 1.6;

export function handheldScene(
	product: ShowcaseProduct,
	kind: "single" | "duplet",
): ShowcaseScene {
	const duplet = kind === "duplet";
	const [s0, s1, s2, s3] = product.steps;
	const studioEnd = s1.start;
	const finale = product.finale.start;

	/* ===================================================================== */
	/* Студия                                                                */
	/* ===================================================================== */

	const studio = makeStudio(0.25);
	const pistol = makePistol(kind);
	pistol.group.position.set(0.15, H, 0);
	pistol.group.rotation.y = -Math.PI / 2;
	studio.scene.add(pistol.group);
	studio.scene.updateMatrixWorld(true);
	const axis = v3(-1, 0, 0);
	const muzzles = pistol.muzzles.map((m) =>
		m.getWorldPosition(new THREE.Vector3()),
	);

	const projectiles: Projectile[] = [];
	const starts = duplet
		? [v3(-0.28, H + 0.1, -0.07), v3(-0.34, H - 0.02, 0.08)]
		: [v3(-0.25, H + 0.03, 0)];
	// Порядок: первым накручивается нижний ствол, затем верхний.
	const loads = duplet
		? [
				{ a: s0.start + s0.hold, b: s0.start + s0.hold + 0.9, c: 6.2 },
				{ a: 6.4, b: 7.3, c: 8.1 },
			]
		: [
				{
					a: s0.start + s0.hold,
					b: s0.start + s0.hold + 1.6,
					c: s0.start + s0.hold + 2.5,
				},
			];
	for (let i = 0; i < starts.length; i += 1) {
		const p = makeProjectile(1, COLORS.blue);
		studio.scene.add(p.group);
		projectiles.push(p);
	}
	const clicks = muzzles.map((m) => {
		const s = glowSprite(COLORS.cyan, 0.16, 0);
		s.position.copy(m);
		studio.scene.add(s);
		return s;
	});

	const studioCam = track([
		[0, v3(0.06, H + 0.2, 1.02)],
		[product.introEnd, v3(-0.08, H + 0.15, 0.84)],
		[s0.start + 0.9, v3(-0.4, H + 0.1, 0.48)],
		[loads[0].a, v3(-0.32, H + 0.12, 0.58)],
		[loads[loads.length - 1].b, v3(-0.15, H + 0.07, 0.42)],
		[studioEnd, v3(-0.06, H + 0.09, 0.34)],
	]);
	const studioAt = track([
		[0, v3(-0.04, H + 0.01, 0)],
		[product.introEnd, v3(-0.05, H + 0.01, 0)],
		[s0.start + 0.9, starts[0].clone().add(v3(0.02, -0.01, 0))],
		[loads[0].a, v3(-0.1, H + 0.02, 0)],
		[loads[loads.length - 1].b, muzzles[0].clone().add(v3(-0.03, 0.02, 0))],
		[studioEnd, muzzles[0].clone()],
	]);

	/* ===================================================================== */
	/* Поле                                                                  */
	/* ===================================================================== */

	const field = makeField({
		seed: duplet ? 23 : 11,
		clear: 8,
		zMin: -20,
		zMax: 130,
	});
	const hand = v3(0.24, 1.42, 0.12);
	const gun = makePistol(kind);
	gun.group.position.copy(hand);
	field.scene.add(gun.group);
	// Снаряды уже на дулах; уложенная сеть исчезает при выстреле.
	const mounted = gun.muzzles.map((m) => {
		const p = makeProjectile(1, COLORS.blue);
		p.group.position.copy(m.position).add(v3(0, 0, -0.028));
		p.group.rotation.z = TURN;
		gun.group.add(p.group);
		return p;
	});

	const target = makeTargetDrone();
	target.group.scale.setScalar(DRONE_SCALE);
	field.scene.add(target.group);

	const range = makeDropZone(25, COLORS.net, 0.09, false);
	field.scene.add(range.group);

	// Сценарий поля.
	const shots = duplet
		? [
				{ at: s2.start + 0.4, flight: 1.9, barrel: 1, hit: false },
				{ at: s3.start + 0.4, flight: 1.8, barrel: 0, hit: true },
			]
		: [{ at: s2.start + 0.4, flight: 2.0, barrel: 0, hit: true }];
	const final = shots[shots.length - 1];
	const hitAt = final.at + final.flight;
	const approachFrom = duplet ? v3(6, 6.5, 36) : v3(7, 6, 40);
	const approachTo = v3(0.5, 1.9, 2.5);
	const impactAt = hitAt + 1.4;
	const dodge = (t: number) =>
		duplet ? smooth(shots[0].at + 0.5, shots[0].at + 1.4, t) : 0;

	/** Положение цели до попадания — чистая функция от t. */
	function dronePath(t: number, out: THREE.Vector3) {
		out.copy(approachFrom).lerp(approachTo, seg(t, s1.start, impactAt));
		out.x +=
			0.25 * Math.sin(t * 1.7) +
			(duplet ? 1.6 * Math.sin(t * 1.5) * (1 - dodge(t)) : 0);
		out.y += 0.15 * Math.sin(t * 2.3);
		if (duplet) {
			out.x += 3.0 * dodge(t);
			out.y += 0.8 * dodge(t);
		}
		return out;
	}

	const tmp = v3();
	const aimPose = (point: THREE.Vector3) => {
		const dummy = new THREE.Object3D();
		dummy.position.copy(hand);
		dummy.lookAt(point);
		return dummy.quaternion.clone();
	};
	const restPose = aimPose(v3(0.5, 0.1, 6));
	const rigs = shots.map((shot) => {
		// Прицел: туда, где цель окажется к приходу сети. У первого
		// выстрела Дуплета расчёт без уклонения — поэтому он и мимо.
		const aimT = shot.at + shot.flight;
		const predicted = dronePath(aimT, v3());
		if (duplet && !shot.hit) predicted.x -= 3.0 * dodge(aimT);
		const pose = aimPose(predicted);
		gun.group.quaternion.copy(pose);
		gun.group.updateMatrixWorld(true);
		const muzzle = gun.muzzles[shot.barrel].getWorldPosition(v3());
		const heading = predicted.clone().sub(muzzle).normalize();
		const aimPoint = predicted.clone().addScaledVector(heading, -0.32);
		const rig = new ShotRig(
			field.scene,
			shot.at,
			{
				muzzle,
				target: aimPoint,
				flight: shot.flight,
			},
			1.5,
		);
		return { ...shot, rig, pose, heading };
	});
	const fall = makeFall(dronePath(hitAt, v3()), rigs[rigs.length - 1].heading, {
		push: 1.1,
		rest: 0.26,
	});
	const dust = new Dust();
	field.scene.add(dust.group);

	const fieldCam = track([
		[s1.start, v3(0.66, 1.76, -1.2)],
		[s1.start + s1.hold, v3(0.58, 1.73, -1.02)],
		[shots[0].at - 0.1, v3(0.52, 1.71, -0.92)],
		[shots[0].at + 0.9, duplet ? v3(9, 3.8, -1.5) : v3(6, 2.7, 2.4)],
		...(duplet
			? ([
					[shots[1].at - 0.3, v3(5.2, 2.4, 1.4)],
					[shots[1].at + 0.8, v3(5.6, 2.8, 3.2)],
				] as Array<[number, THREE.Vector3]>)
			: []),
		[hitAt, duplet ? v3(10, 3.8, 2.5) : v3(5.3, 3.0, 5)],
		[hitAt + 1.4, duplet ? v3(9.4, 2.8, 3.6) : v3(4.8, 2.3, 5.4)],
		[finale, duplet ? v3(8.8, 2.2, 4.4) : v3(4.4, 1.7, 5.8)],
		[finale + 2.2, v3(7, 7.4, -3)],
		[product.duration, v3(7.6, 9, -5)],
	]);
	const landingMid = fall.landing.clone();
	const fieldAt = track([
		[s1.start, v3(0.5, 2.5, 10)],
		[s1.start + s1.hold, v3(1.5, 3.3, 14)],
		[shots[0].at - 0.1, v3(1.3, 3.0, 12)],
		[shots[0].at + 0.9, duplet ? v3(2.8, 3.4, 11) : v3(1.2, 2.7, 8)],
		...(duplet
			? ([
					[shots[1].at - 0.3, v3(2.2, 2.6, 8)],
					[shots[1].at + 0.8, v3(2.4, 2.7, 7.5)],
				] as Array<[number, THREE.Vector3]>)
			: []),
		[hitAt, dronePath(hitAt, v3())],
		[hitAt + 1.4, landingMid.clone().add(v3(0, 0.8, 0))],
		[finale, landingMid.clone().add(v3(0, 0.3, 0))],
		[finale + 2.2, v3(1.6, 0.4, 9)],
		[product.duration, v3(1.6, 0.4, 9)],
	]);

	/* ===================================================================== */
	/* Кадр                                                                  */
	/* ===================================================================== */

	const droneFacing = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(0, Math.PI, 0),
	);
	const lean = new THREE.Quaternion();
	const result: ShowcaseScene = {
		scene: studio.scene,
		zero: shots[0].at,
		update(ctx: FrameContext) {
			const { t, time } = ctx;
			ctx.fade(windowed(t, studioEnd - 0.4, studioEnd + 0.4, 0.4));
			if (t < studioEnd) {
				result.scene = studio.scene;
				updateStudio(ctx);
			} else {
				result.scene = field.scene;
				updateField(ctx);
			}
			void time;
		},
		dispose() {
			disposeTree(studio.scene);
			disposeTree(field.scene);
		},
	};

	function updateStudio(ctx: FrameContext) {
		const { t, time } = ctx;
		const scanY = H - 0.16 + 0.3 * seg(t, 0.2, 2.4);
		const scan = windowed(t, 0.2, 2.6, 0.4);
		pistol.material.uniforms.uScan.value = scan;
		pistol.material.uniforms.uScanY.value = scanY;
		pistol.group.position.y = H + 0.004 * Math.sin(time * 1.1);

		projectiles.forEach((p, i) => {
			const { a, b, c } = loads[i];
			const muzzle = muzzles[i];
			const near = muzzle.clone().addScaledVector(axis, 0.03);
			const seated = muzzle.clone().addScaledVector(axis, -0.016);
			const tight = muzzle.clone().addScaledVector(axis, -0.028);
			const pos = p.group.position;
			const k = easeInOut(seg(t, a, b));
			if (t < a) {
				pos.copy(starts[i]);
				pos.y += 0.006 * Math.sin(time * 1.3 + i * 2);
			} else if (k < 0.82) {
				pos.copy(starts[i]).lerp(near, k / 0.82);
			} else {
				pos.copy(near).lerp(seated, (k - 0.82) / 0.18);
			}
			const sk = easeInOut(seg(t, b, c));
			if (t >= b) pos.copy(seated).lerp(tight, sk);
			p.group.rotation.set(
				0,
				-Math.PI / 2,
				TURN * sk + (t < a ? Math.sin(time * 0.6 + i) * 0.2 : 0),
			);
			p.material.uniforms.uScan.value = scan;
			p.material.uniforms.uScanY.value = scanY;
			// Щелчок — короткая вспышка на стыке.
			const click = windowed(t, c - 0.05, c + 0.35, 0.12);
			(clicks[i].material as THREE.SpriteMaterial).opacity = click;
			clicks[i].scale.setScalar(0.08 + 0.12 * click);

			ctx.label(
				`thread-${i}`,
				"1/3 оборота",
				muzzle,
				windowed(t, b, c + 0.6, 0.25),
				{
					sub: "до щелчка",
				},
			);
		});

		const p0 = projectiles[0].group.position;
		const hold = s0.start + s0.hold;
		ctx.label(
			"net",
			duplet ? "сеть 5,7 м² в каждом" : "сеть 5,7 м²",
			p0.clone().addScaledVector(axis, 0.13),
			windowed(t, s0.start + 0.4, hold - 0.1, 0.3),
			{
				sub: "внутри",
				accent: true,
				left: true,
			},
		);
		if (!duplet) {
			ctx.label(
				"gas",
				"газогенератор",
				p0
					.clone()
					.addScaledVector(axis, 0.02)
					.add(v3(0, -0.02, 0)),
				windowed(t, s0.start + 1.2, hold + 0.2, 0.3),
				{
					sub: "внутри",
					left: true,
				},
			);
			const c = loads[0].c;
			ctx.label(
				"reload",
				"от 3 с",
				muzzles[0].clone().add(v3(0.04, 0.05, 0)),
				windowed(t, c + 0.3, studioEnd - 0.2, 0.25),
				{
					sub: "перезарядка",
				},
			);
		} else {
			ctx.label(
				"no-reload",
				"без перезарядки",
				muzzles[1].clone().add(v3(0.06, 0.06, 0)),
				windowed(t, loads[1].c + 0.2, studioEnd - 0.2, 0.25),
				{
					sub: "второй выстрел",
					accent: true,
				},
			);
		}
		const camPos = studioCam(t).clone();
		camPos.x += Math.sin(time * 0.25) * 0.01;
		ctx.look(camPos, studioAt(t), 32);
	}

	function updateField(ctx: FrameContext) {
		const { t, time } = ctx;
		/* ---- Пистолет: опущен → прицел → отдача ---- */
		let pose = restPose;
		const aimK = easeInOut(seg(t, s1.start + 0.3, shots[0].at - 0.4));
		const q = gun.group.quaternion;
		q.copy(restPose).slerp(rigs[0].pose, aimK);
		if (duplet) {
			const re = easeInOut(seg(t, shots[0].at + 1.2, shots[1].at - 0.3));
			q.slerp(rigs[1].pose, re);
		}
		pose = q.clone();
		let kick = 0;
		for (const r of rigs) {
			const d = t - r.at;
			if (d > 0) kick += (1 - Math.exp(-d / 0.03)) * Math.exp(-d / 0.28);
		}
		lean.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.55 * kick);
		q.copy(pose).multiply(lean);
		// После захвата оператор опускает рукоять.
		q.slerp(restPose, smooth(hitAt + 1, hitAt + 2.6, t) * 0.7);
		rigs.forEach((r) => {
			mounted[r.barrel].packed.visible = t < r.at;
		});

		/* ---- Цель ---- */
		const hitT = t - hitAt;
		const caught = hitT >= 0;
		const fallState = fall.state(hitT);
		const drone = target.group;
		if (!caught) {
			dronePath(t, drone.position);
			dronePath(t + 0.05, tmp);
			const vel = tmp.sub(drone.position);
			lean.setFromEuler(
				new THREE.Euler(0.35, Math.atan2(vel.x, vel.z) - Math.PI, -vel.x * 3),
			);
			drone.quaternion.copy(droneFacing).multiply(lean);
		} else {
			drone.position.copy(fallState.pos);
			drone.quaternion.copy(droneFacing).multiply(fallState.turn);
		}
		const rotor = 1 - smooth(0, 0.7, hitT);
		target.spin(time * 60 * (caught ? rotor : 1) + (caught ? 0 : 0), rotor);
		drone.visible = t >= s1.start;

		/* ---- Выстрелы ---- */
		let netOpen = 0;
		let netPos: THREE.Vector3 | null = null;
		rigs.forEach((r, i) => {
			const isFinal = i === rigs.length - 1;
			const wrap =
				r.hit && caught
					? {
							center: drone.position,
							turn: fallState.turn,
							radii: bagRadii(0.42 * DRONE_SCALE),
						}
					: null;
			const st = r.rig.update(t, wrap, {
				fade: !r.hit
					? 1 - smooth(r.at + r.flight + 2, r.at + r.flight + 3, t)
					: 1,
			});
			if (st.open > netOpen) {
				netOpen = st.open;
				netPos = r.rig.net.nodes[Math.floor(r.rig.net.nodes.length / 2)];
			}
			if (!r.hit) {
				const missK = windowed(
					t,
					r.at + r.flight - 0.1,
					r.at + r.flight + 1.6,
					0.25,
				);
				ctx.label("miss", "промах", r.rig.net.nodes[0], missK, {
					accent: true,
					sub: "дрон уклонился",
				});
			}
			const sinceShot = t - r.at;
			if (sinceShot > 0 && sinceShot < 0.6)
				ctx.shake(0.06 * Math.exp(-sinceShot / 0.12));
			if (isFinal) {
				const zoneK = smooth(hitAt + 0.4, hitAt + 1.2, t);
				r.rig.zone.group.position.set(fall.landing.x, 0.02, fall.landing.z);
				r.rig.zone.set(zoneK, 0.6 + 0.4 * zoneK, time);
			} else {
				r.rig.zone.set(0, 1, time);
			}
		});
		if (netPos) {
			ctx.label(
				"area",
				"5,7 м²",
				(netPos as THREE.Vector3).clone().add(v3(0, 1.3, 0)),
				netOpen,
				{
					sub: "площадь сети",
					accent: true,
				},
			);
		}
		dust.update(hitT - fall.landAfter, fall.landing);

		/* ---- Дальность и визирование ---- */
		const rangeK =
			windowed(t, s1.start + 0.2, finale + 4, 0.6) *
			(1 - 0.6 * smooth(hitAt, hitAt + 1, t));
		range.set(rangeK * 0.75, 1, time);
		ctx.label(
			"range",
			"до 25 м",
			v3(Math.sin(0.32) * 25, 0, Math.cos(0.32) * 25),
			windowed(t, s1.start + 0.8, shots[0].at + 0.3, 0.4),
			{
				sub: "дальность поражения",
				large: true,
				accent: true,
			},
		);
		const dist = drone.position.distanceTo(hand);
		ctx.label(
			"target",
			`${dist.toFixed(1)} м`,
			drone.position,
			windowed(t, s1.start + 0.6, shots[0].at + 0.2, 0.3) * (caught ? 0 : 1),
			{
				sub: duplet ? "цель · манёвр" : "FPV-дрон",
			},
		);
		ctx.label(
			"zone",
			"зона падения",
			fall.landing.clone().add(v3(1.2, 0, 0)),
			windowed(t, hitAt + fall.landAfter, finale + 0.6, 0.35),
			{
				sub: "прогнозируемая",
				accent: true,
			},
		);

		/* ---- Камера ---- */
		const at = fieldAt(t).clone();
		if (caught)
			at.lerp(
				drone.position,
				0.5 * (1 - smooth(hitAt + 1.4, finale, t)) * smooth(0, 0.4, hitT),
			);
		ctx.look(fieldCam(t), at, 40);
	}

	return result;
}
