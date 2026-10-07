/**
 * Тройная установка: три сеткомёта на крыше автомобиля, стволами назад.
 *
 * Машина стоит в начале координат, мир едет мимо неё: дорога, фонари,
 * лес и сетка земли сдвигаются на пройденный путь. Так камера может
 * спокойно облетать машину, а скорость читается по окружению.
 *
 * Три БпЛА догоняют машину по очереди. На каждый — свой снаряд и свой
 * тумблер на пульте (окно «пульт управления · в салоне»): сеть уходит
 * назад, накрывает аппарат, он падает на дорогу позади, машина едет
 * дальше. Так и показана трёхзарядность: три пуска без перезарядки.
 */

import * as THREE from "three";
import type { ShowcaseProduct } from "../../content/showcase-content";
import type { FrameContext, ShowcaseScene } from "../engine";
import {
	COLORS,
	disposeTree,
	easeInOut,
	easeOut,
	makeTrees,
	makeWorld,
	seg,
	smooth,
	track,
	v3,
	windowed,
} from "../kit";
import { makeCar, makeRemote, makeRoad, makeTargetDrone } from "../models";
import { bagRadii, Dust, makeFall, ShotRig } from "./common";

const SPEED = 9;
const TARGET_SCALE = 1.8;
const LOOP = 160;
const TURN = (Math.PI * 2) / 3;

export function tripleScene(product: ShowcaseProduct): ShowcaseScene {
	const [s0, s1, ...launches] = product.steps;
	const finale = product.finale.start;

	const world = makeWorld({ fogNear: 18, fogFar: 95 });
	const { scene } = world;
	const car = makeCar();
	scene.add(car.group);
	const road = makeRoad();
	scene.add(road.group);
	// Лес двумя одинаковыми полосами: сдвиг по модулю длины полосы.
	const forest = new THREE.Group();
	for (let k = 0; k < 2; k += 1) {
		const trees = makeTrees(70, 71, (_i, rnd) => {
			const side = rnd(1) > 0.5 ? 1 : -1;
			const x = side * (7 + rnd(2) * 40);
			return v3(x, 0, -LOOP / 2 + rnd(3) * LOOP);
		});
		trees.position.z = k * LOOP;
		forest.add(trees);
	}
	scene.add(forest);

	/* ---- Три цели подряд: по снаряду и тумблеру на каждую ---- */
	const FLIGHT = 1.2;
	const lanes = [
		{ x: 0.6, y: 4.2 },
		{ x: -1.5, y: 3.6 },
		{ x: 1.5, y: 4.8 },
	];
	const shots = launches.map((step) => step.start + step.hold);
	const hits = shots.map((at) => at + FLIGHT);
	// Каждый следующий аппарат появляется вскоре после пуска по предыдущему.
	const appear = [s1.start + 0.2, shots[0] + 0.5, shots[1] + 0.5];

	/** Положение БпЛА i относительно машины до попадания. */
	function dronePath(i: number, t: number, out: THREE.Vector3) {
		const k = easeInOut(seg(t, appear[i], shots[i] + 0.6));
		return out.set(
			lanes[i].x + 0.6 * Math.sin(t * 0.8 + i),
			lanes[i].y + 0.3 * Math.sin(t * 1.3 + i),
			-34 + 25 * k,
		);
	}

	scene.updateMatrixWorld(true);
	const rounds = car.launcher.rounds;
	const targets = shots.map((at, i) => {
		const drone = makeTargetDrone();
		drone.group.scale.setScalar(TARGET_SCALE);
		scene.add(drone.group);
		const muzzle = rounds[i].mouth.getWorldPosition(v3());
		const meet = dronePath(i, hits[i], v3());
		const dir = meet.clone().sub(muzzle).normalize();
		const shot = new ShotRig(
			scene,
			at,
			{
				muzzle,
				target: meet.clone().addScaledVector(dir, -0.4),
				flight: FLIGHT,
			},
			1.8,
		);
		// Падение — в системе отсчёта дороги; относительно машины точка уезжает назад.
		const fall = makeFall(meet, v3(0, 0, 1), { push: 1.5, rest: 0.28 });
		const dust = new Dust();
		scene.add(dust.group);
		return { drone, shot, fall, dust, meet, muzzle };
	});

	/* ---- Пульт в салоне: отдельная маленькая сцена для окна ---- */
	const remoteScene = new THREE.Scene();
	remoteScene.background = COLORS.bg.clone();
	const remote = makeRemote();
	remoteScene.add(remote.group);
	const remoteCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 10);
	remoteCam.position.set(0.07, 0.17, 0.17);
	remoteCam.lookAt(0, 0.045, -0.012);

	/* ---- Снаряды накручиваются на втулки по одному ---- */
	const hold = s0.start + s0.hold;
	const loadAt = (i: number) => hold + i * 0.85;
	function loadRounds(t: number) {
		rounds.forEach((r, i) => {
			const a = loadAt(i);
			const come = easeOut(seg(t, a, a + 0.45));
			const screw = easeInOut(seg(t, a + 0.45, a + 0.8));
			r.group.visible = t >= a;
			r.group.position.z = -0.028 - 0.35 * (1 - come) - 0.01 * (1 - screw);
			r.group.position.y = 0.07 + 0.08 * (1 - come);
			r.group.rotation.z = TURN * screw;
			// Пуск: фетровая крышка слетает назад, сеть уходит из раструба.
			const pop = seg(t, shots[i], shots[i] + 0.7);
			r.cap.visible = pop < 1;
			r.cap.position.set(0, -0.25 * pop * pop, -0.6 * pop);
			r.cap.rotation.x = pop * 5;
			r.packed.visible = t < shots[i];
		});
	}

	// Камера: из-за машины назад на подходящий аппарат, на попадании —
	// сбоку, затем снова назад за следующим.
	const camKeys: Array<[number, THREE.Vector3]> = [
		[0, v3(5.4, 3.6, 6.4)],
		[product.introEnd, v3(3.2, 3.2, -0.4)],
		[s0.start + s0.hold, v3(1.3, 2.4, -3.1)],
		[s0.end - 0.6, v3(-1.1, 2.55, -3.3)],
		[s1.start + s1.hold, v3(1.1, 4.6, 4.6)],
	];
	const atKeys: Array<[number, THREE.Vector3]> = [
		[0, v3(0, 1.4, 0)],
		[product.introEnd, v3(0, 1.9, -1.4)],
		[s0.start + s0.hold, v3(0, 1.97, -1.78)],
		[s0.end - 0.6, v3(0, 1.97, -1.8)],
		[s1.start + s1.hold, v3(0, 2.0, -9)],
	];
	targets.forEach((tg, i) => {
		const side = i === 1 ? -1 : 1;
		camKeys.push(
			[shots[i] - 0.2, v3(1.6 * side, 4.2, 3.6)],
			[hits[i], v3(4.6 * side, 3.6, -2.5)],
		);
		atKeys.push(
			[shots[i] - 0.2, v3(lanes[i].x * 0.5, 2.2, -7)],
			[hits[i], tg.meet.clone()],
		);
		if (i < targets.length - 1) {
			camKeys.push([hits[i] + 1.1, v3(1.2 * side, 4.5, 4.4)]);
			atKeys.push([hits[i] + 1.1, v3(0, 2.0, -11)]);
		}
	});
	camKeys.push(
		[finale, v3(4.6, 3.2, -1.8)],
		[product.duration, v3(7.5, 8.5, 4)],
	);
	atKeys.push([finale, v3(0, 0.6, -7.6)], [product.duration, v3(0, 0.6, -7)]);
	const cam = track(camKeys);
	const at = track(atKeys);

	const update = (ctx: FrameContext) => {
		const { t, time } = ctx;
		const offset = SPEED * t;
		road.update(offset);
		world.ground.update(ctx.camera, offset);
		forest.position.z = -(offset % LOOP);
		for (const w of car.wheels) w.rotation.x = offset / 0.38;
		car.group.position.y = 0.012 * Math.sin(time * 9);
		loadRounds(t);
		car.group.updateMatrixWorld(true);

		/* ---- Цели, выстрелы, падения ---- */
		targets.forEach((tg, i) => {
			const drone = tg.drone.group;
			const hitT = t - hits[i];
			const caught = hitT >= 0;
			const st = tg.fall.state(hitT);
			// Упавший аппарат лежит на дороге — машина от него уезжает.
			const recede = caught ? -SPEED * hitT : 0;
			if (!caught) {
				dronePath(i, t, drone.position);
				drone.rotation.set(0.35, 0, 0.1 * Math.sin(t * 1.4 + i));
			} else {
				drone.position.copy(st.pos);
				drone.position.z += recede;
				drone.quaternion.copy(st.turn);
			}
			// Аппарат за 90 м позади уже не нужен: туман его всё равно съел.
			drone.visible = t > appear[i] - 0.3 && recede > -90;
			tg.drone.spin(time * 60, 1 - smooth(0, 0.6, hitT));

			const state = tg.shot.update(
				t,
				caught
					? {
							center: drone.position,
							turn: st.turn,
							radii: bagRadii(0.42 * TARGET_SCALE),
						}
					: null,
			);
			tg.shot.net.group.visible &&= recede > -90;
			const zoneK = smooth(hits[i] + 0.5, hits[i] + 1.3, t);
			tg.shot.zone.group.position.set(
				tg.fall.landing.x,
				0.02,
				tg.fall.landing.z + recede,
			);
			tg.shot.zone.set(recede > -90 ? zoneK : 0, 0.6 + 0.4 * zoneK, time);
			tg.dust.update(
				hitT - tg.fall.landAfter,
				v3(tg.fall.landing.x, 0, tg.fall.landing.z + recede),
			);
			if (t > shots[i] && t < shots[i] + 0.6)
				ctx.shake(0.05 * Math.exp(-(t - shots[i]) / 0.12));

			const dist = drone.position.distanceTo(tg.muzzle);
			ctx.label(
				`drone-${i}`,
				`${dist.toFixed(1)} м`,
				drone.position,
				windowed(t, appear[i] + 0.4, shots[i], 0.3) * (caught ? 0 : 1),
				{
					sub: `БпЛА ${i + 1} позади`,
					accent: dist < 12,
				},
			);
			ctx.label(
				`area-${i}`,
				"5,7 м²",
				tg.shot.net.nodes[tg.shot.net.nodes.length - 1],
				state.open,
				{
					sub: `снаряд ${i + 1} из 3`,
					accent: true,
				},
			);
			const isLast = i === targets.length - 1;
			ctx.label(
				`zone-${i}`,
				isLast ? "зона падения" : `перехват ${i + 1}`,
				v3(tg.fall.landing.x + 1.4, 0, tg.fall.landing.z + recede),
				windowed(
					t,
					hits[i] + tg.fall.landAfter,
					isLast ? finale + 0.8 : hits[i] + tg.fall.landAfter + 1.8,
					0.35,
				),
				{ sub: isLast ? "прогнозируемая" : "аппарат позади", accent: true },
			);

			/* ---- Пульт: колпачок откинут, тумблер вверх ---- */
			const open = easeOut(seg(t, shots[i] - 1.1, shots[i] - 0.6));
			remote.covers[i].rotation.x = -1.9 * open;
			const flip = smooth(shots[i] - 0.22, shots[i] - 0.05, t);
			remote.levers[i].rotation.x = 0.45 - 0.9 * flip;
			(remote.leds[i].material as THREE.SpriteMaterial).opacity =
				0.5 + 0.5 * flip;
			remote.leds[i].scale.setScalar(0.008 + 0.012 * flip);
		});

		/* ---- Подписи установки ---- */
		const launcher = car.launcher;
		ctx.label(
			"thread",
			"резьбовое",
			launcher.bosses[1].getWorldPosition(v3()),
			windowed(t, s0.start + 0.4, s0.start + 1.5, 0.25),
			{
				sub: "крепление снаряда",
			},
		);
		ctx.label(
			"steel",
			"сталь · 3,48 кг",
			launcher.bracket.getWorldPosition(v3()),
			windowed(t, s0.start + 1.4, hold + 0.3, 0.25),
			{
				sub: "уголок",
			},
		);
		ctx.label(
			"three",
			"3 снаряда",
			rounds[2].mouth.getWorldPosition(v3()),
			windowed(t, loadAt(2) + 0.8, s0.end, 0.25),
			{
				sub: "на резьбе · стволы назад",
				accent: true,
				left: true,
			},
		);
		ctx.label(
			"speed",
			"47 км/ч",
			launcher.bracket.getWorldPosition(v3()).add(v3(0, 0.5, 0)),
			windowed(t, s1.start + 0.2, shots[0] - 0.2, 0.3),
			{
				sub: "в движении",
			},
		);
		ctx.label(
			"cable",
			"5–50 м",
			car.window.getWorldPosition(v3()),
			windowed(t, s1.start + 0.2, s1.start + s1.hold + 1.2, 0.3),
			{
				sub: "кабель пульта · в салон",
			},
		);

		ctx.pip(
			remoteScene,
			remoteCam,
			"Пульт управления · в салоне",
			windowed(t, s1.start + s1.hold, shots[2] + 0.9, 0.35),
		);

		// После третьего захвата камера остаётся на дороге рядом с упавшим
		// аппаратом, а машина уезжает: «автомобиль продолжает движение».
		const lastT = t - hits[hits.length - 1];
		const stay = lastT > 0 ? SPEED * lastT * smooth(0, 1.2, lastT) : 0;
		const camPos = cam(t).clone();
		const camAt = at(t).clone();
		camPos.z -= stay;
		camAt.z -= stay;
		ctx.look(camPos, camAt, 40);
	};

	return {
		scene,
		zero: shots[0],
		update,
		dispose() {
			disposeTree(remoteScene);
		},
	};
}
