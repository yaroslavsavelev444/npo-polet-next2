/**
 * Сеткомёт Mavic: подвесной сеткомёт под брюхом квадрокоптера.
 *
 *  1. Студия — крепление ставится под брюхо и стягивается резинкой,
 *     сеткомёт накручивается на гнездо, шлейф платы входит в разъём дрона,
 *     пуск — светом на фотодиод.
 *  2. Поле — Mavic зависает над целью (окно «камера Mavic · взгляд
 *     вниз»), вспышка на фотодиоде, сеть падает сверху куполом и
 *     накрывает цель.
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
import { makeMavic, makeTargetDrone } from "../models";
import {
	bagRadii,
	Dust,
	makeFall,
	makeField,
	makeStudio,
	ShotRig,
} from "./common";

const H = 0.36;
const MAVIC_SCALE = 2.6;
const TARGET_SCALE = 1.6;

export function mavicScene(product: ShowcaseProduct): ShowcaseScene {
	const [s0, s1, s2, s3, s4] = product.steps;
	const studioEnd = s3.start;
	const finale = product.finale.start;

	/* ===================================================================== */
	/* Студия                                                                */
	/* ===================================================================== */

	const studio = makeStudio(0.25);
	const mavic = makeMavic();
	mavic.group.position.set(0, H, 0);
	studio.scene.add(mavic.group);
	const mountAt = s0.start + s0.hold;
	const bandAt = mountAt + 1.1;
	const liftAt = s1.start + s1.hold;
	const screwAt = liftAt + 1.1;
	const plugAt = s2.start + s2.hold;
	const lightAt = plugAt + 1.2;

	const studioCam = track([
		[0, v3(0.86, H + 0.38, 0.96)],
		[product.introEnd, v3(0.7, H + 0.2, 0.8)],
		[mountAt, v3(0.58, H, 0.64)],
		[liftAt, v3(0.52, H - 0.14, 0.68)],
		[plugAt, v3(0.54, H - 0.04, 0.58)],
		[lightAt, v3(0.46, H - 0.1, 0.54)],
		[studioEnd, v3(0.64, H - 0.04, 0.72)],
	]);
	const studioAt = track([
		[0, v3(0, H, 0)],
		[mountAt, v3(0, H - 0.04, 0)],
		[liftAt, v3(0, H - 0.12, 0)],
		[plugAt, v3(0.03, H - 0.05, 0.04)],
		[lightAt, v3(0.02, H - 0.1, 0.02)],
		[studioEnd, v3(0, H - 0.08, 0)],
	]);

	/* ===================================================================== */
	/* Поле                                                                  */
	/* ===================================================================== */

	const field = makeField({ seed: 47, clear: 6, zMin: -30, zMax: 140 });
	const hover = makeMavic();
	hover.group.scale.setScalar(MAVIC_SCALE);
	field.scene.add(hover.group);
	const target = makeTargetDrone();
	target.group.scale.setScalar(TARGET_SCALE);
	field.scene.add(target.group);

	const shotAt = s4.start + s4.hold + 0.2;
	const flight = 1.1;
	const hitAt = shotAt + flight;

	function targetPath(t: number, out: THREE.Vector3) {
		return out.set(
			-2 + 0.8 * (t - studioEnd),
			3 + 0.15 * Math.sin(t * 1.6),
			8 + 0.3 * Math.sin(t * 0.5),
		);
	}
	const above = targetPath(hitAt, v3());
	function mavicPath(t: number, out: THREE.Vector3) {
		out
			.set(-4, 9.5, 6)
			.lerp(
				v3(above.x - 0.4, 7.2, above.z),
				easeInOut(seg(t, studioEnd + 0.2, s4.start)),
			);
		return out;
	}
	mavicPath(shotAt, hover.group.position);
	field.scene.updateMatrixWorld(true);
	const mouth = hover.mouth.getWorldPosition(v3());
	const shot = new ShotRig(
		field.scene,
		shotAt,
		{ muzzle: mouth, target: above.clone().add(v3(0, 0.45, 0)), flight },
		1.5,
	);
	const fall = makeFall(above, v3(0.8, 0, 0), { push: 0.8, rest: 0.26 });
	const landing = fall.landing;
	const dust = new Dust();
	field.scene.add(dust.group);
	const pipCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 200);

	const fieldCam = track([
		[studioEnd, v3(-11, 7, 20)],
		[s3.start + s3.hold, v3(-6, 6.5, 19)],
		[s4.start, v3(8.5, 6.8, 21)],
		[hitAt, v3(8.5, 4.8, 18)],
		[finale, landing.clone().add(v3(5, 2.6, 7))],
		[product.duration, landing.clone().add(v3(7, 8.5, 10))],
	]);
	const fieldAt = track([
		[studioEnd, v3(-2, 5, 7)],
		[s3.start + s3.hold, v3(0, 5.2, 7.5)],
		[s4.start, v3(above.x, 5.4, 8)],
		[hitAt, above.clone().add(v3(0, 0.6, 0))],
		[finale, landing.clone().add(v3(0, 0.4, 0))],
		[product.duration, landing.clone()],
	]);

	/* ===================================================================== */
	/* Кадр                                                                  */
	/* ===================================================================== */

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
		mavic.group.position.y = H + 0.004 * Math.sin(time * 1.1);
		mavic.group.rotation.y =
			-0.5 + 0.2 * Math.sin(time * 0.18) + 0.6 * seg(t, 0, mountAt);
		mavic.spin(0, 0);
		// Крепление поднимается под брюхо, резинка стягивает его.
		const m = easeOut(seg(t, mountAt, mountAt + 0.9));
		mavic.mount.position.y = -0.22 * (1 - m);
		mavic.mount.visible = t >= mountAt - 0.05;
		const b = easeOut(seg(t, bandAt, bandAt + 0.8));
		mavic.band.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * b));
		(mavic.band.material as THREE.MeshBasicMaterial).opacity = 0.95 * b;
		// Сеткомёт снизу: подъём, затем навинчивание.
		const l = easeOut(seg(t, liftAt, screwAt));
		const sc = easeInOut(seg(t, screwAt, screwAt + 0.8));
		mavic.launcher.position.y = -0.07 - 0.3 * (1 - l) + 0.012 * (1 - sc);
		mavic.launcher.rotation.y = Math.PI * 0.66 * sc;
		mavic.launcher.visible = t >= liftAt - 0.05;
		// Шлейф и вспышка на фотодиоде.
		const plug = smooth(plugAt, plugAt + 0.6, t);
		mavic.plug.visible = t >= plugAt;
		(mavic.plug.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.8 * plug;
		const flash =
			windowed(t, lightAt, lightAt + 0.9, 0.2) *
			(0.6 + 0.4 * Math.sin(time * 18));
		(mavic.photodiode.material as THREE.SpriteMaterial).opacity =
			0.35 + 0.65 * flash;
		mavic.photodiode.scale.setScalar(0.03 + 0.05 * flash);

		mavic.group.updateMatrixWorld(true);
		const belly = mavic.socket.getWorldPosition(v3());
		ctx.label(
			"band",
			"на резинке",
			mavic.band.getWorldPosition(v3()).add(v3(0, 0.03, 0)),
			windowed(t, bandAt + 0.3, s1.start + 0.2, 0.25),
			{
				sub: "под брюхо",
			},
		);
		ctx.label(
			"thread",
			"на резьбу",
			belly,
			windowed(t, screwAt, s2.start + 0.2, 0.25),
			{
				sub: "в гнездо крепления",
			},
		);
		ctx.label(
			"plug",
			"+5 В",
			mavic.plug.getWorldPosition(v3()).add(v3(0.04, -0.03, 0.06)),
			windowed(t, plugAt + 0.3, lightAt, 0.25),
			{
				sub: "разъём дрона",
				accent: true,
			},
		);
		ctx.label(
			"diode",
			"светом на фотодиод",
			mavic.photodiode.getWorldPosition(v3()),
			windowed(t, lightAt, studioEnd - 0.1, 0.25),
			{
				sub: "пуск",
				accent: true,
			},
		);
		ctx.label(
			"ammo",
			"4 снаряда",
			mavic.mouth.getWorldPosition(v3()),
			windowed(t, liftAt - 0.2, screwAt, 0.25) * (t >= liftAt - 0.2 ? 1 : 0),
			{
				sub: "в комплекте",
				left: true,
			},
		);
		ctx.look(studioCam(t), studioAt(t), 34);
	}

	function updateField(ctx: FrameContext) {
		const { t, time } = ctx;
		const hitT = t - hitAt;
		const caught = hitT >= 0;
		mavicPath(t, hover.group.position);
		hover.group.position.y += 0.06 * Math.sin(time * 1.4);
		hover.group.rotation.set(
			0.04 * Math.sin(time * 0.9),
			0.4,
			0.03 * Math.sin(time * 1.1),
		);
		hover.spin(time * 70, 1);
		const flash = windowed(t, shotAt - 0.25, shotAt + 0.25, 0.1);
		(hover.photodiode.material as THREE.SpriteMaterial).opacity =
			0.35 + 0.65 * flash;
		hover.photodiode.scale.setScalar(0.03 + 0.08 * flash);

		const st = fall.state(hitT);
		if (!caught) {
			targetPath(t, target.group.position);
			target.group.rotation.set(0.2, Math.PI / 2, 0.1 * Math.sin(t));
		} else {
			target.group.position.copy(st.pos);
			target.group.quaternion.copy(st.turn);
		}
		target.spin(time * 60, 1 - smooth(0, 0.6, hitT));

		const state = shot.update(
			t,
			caught
				? {
						center: target.group.position,
						turn: st.turn,
						radii: bagRadii(0.42 * TARGET_SCALE),
					}
				: null,
		);
		const zoneK = smooth(hitAt + 0.5, hitAt + 1.3, t);
		shot.zone.group.position.set(landing.x, 0.02, landing.z);
		shot.zone.set(zoneK, 0.6 + 0.4 * zoneK, time);
		dust.update(hitT - fall.landAfter, landing);

		const below = hover.group.position.y - target.group.position.y;
		ctx.label(
			"below",
			`${below.toFixed(1)} м`,
			target.group.position,
			windowed(t, s3.start + 0.4, shotAt, 0.3) * (caught ? 0 : 1),
			{
				sub: "под дроном",
				accent: below < 4.6,
			},
		);
		ctx.label(
			"light",
			"пуск светом",
			hover.group.position,
			windowed(t, shotAt - 0.4, shotAt + 0.8, 0.2),
			{
				sub: "фотодиод",
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

		pipCam.position.copy(hover.group.position).add(v3(0, -0.4, 0));
		pipCam.lookAt(caught ? st.pos : target.group.position);
		ctx.pip(
			field.scene,
			pipCam,
			"Камера Mavic · взгляд вниз",
			windowed(t, s3.start + s3.hold, hitAt + 0.5, 0.35),
		);

		ctx.look(fieldCam(t), fieldAt(t), 40);
	}

	return result;
}
