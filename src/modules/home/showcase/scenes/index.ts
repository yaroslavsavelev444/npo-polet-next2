/**
 * Фабрики сцен по изделиям. Сцена строится при первом показе изделия.
 */

import type { ShowcaseProductId } from "../../content/showcase-content";
import type { SceneFactory } from "../engine";
import { fpvScene } from "./fpv";
import { handheldScene } from "./handheld";
import { mavicScene } from "./mavic";
import { tripleScene } from "./triple";
import { vulturScene } from "./vultur";

export const sceneFactories: Record<ShowcaseProductId, SceneFactory> = {
	"pauk-30bn": (p) => handheldScene(p, "single"),
	"pauk-duplet": (p) => handheldScene(p, "duplet"),
	"setkomet-fpv": fpvScene,
	"setkomet-mavic": mavicScene,
	"vultur-r10": vulturScene,
	triple: tripleScene,
};
