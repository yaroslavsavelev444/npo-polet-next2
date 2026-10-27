/**
 * Включённость услуги 3D-печати: одна отметка в «Настройках сайта» решает,
 * есть ли пункт меню, страница /3d-printing (иначе 404) и строка в sitemap.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Setting } from "../../payload-types.ts";
import { isPrintServiceEnabled } from "../../src/utils/settings-helpers.ts";

const settings = (printService: Setting["printService"]) =>
	({ printService }) as Setting;

describe("isPrintServiceEnabled", () => {
	test("выключена только явной отметкой false", () => {
		assert.equal(isPrintServiceEnabled(settings({ enabled: false })), false);
	});

	test("включена отметкой true", () => {
		assert.equal(isPrintServiceEnabled(settings({ enabled: true })), true);
	});

	test("незаполненный глобал и запись без группы — включена (defaultValue)", () => {
		assert.equal(isPrintServiceEnabled(null), true);
		assert.equal(isPrintServiceEnabled(settings(undefined)), true);
		assert.equal(isPrintServiceEnabled(settings({ enabled: null })), true);
	});
});
