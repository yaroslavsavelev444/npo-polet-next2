import assert from "node:assert/strict";
import { test } from "node:test";
import {
	countFacetSelection,
	facetSelectionSignature,
	readFacetSelection,
	writeFacetSelection,
} from "../../src/modules/productCatalog/lib/facetParams.ts";

/**
 * Формат фасетов в адресе каталога.
 *
 * Запуск: pnpm test:catalog
 */

test("чтение: списки, диапазоны, производитель, скидка", () => {
	const selection = readFacetSelection(
		new URLSearchParams(
			"brand=b&brand=a&discount=1&f.massa=0.4~2&f.stepen-zashchity=ip67&f.stepen-zashchity=ip54&sort=price",
		),
	);
	assert.deepEqual(selection, {
		brands: ["a", "b"],
		discount: true,
		specs: {
			massa: { min: 0.4, max: 2 },
			"stepen-zashchity": { values: ["ip54", "ip67"] },
		},
	});
});

test("один выбор — один адрес, независимо от порядка отметок", () => {
	const a = readFacetSelection(
		new URLSearchParams("f.x=2&brand=b&f.x=1&brand=a"),
	);
	const b = readFacetSelection(
		new URLSearchParams("brand=a&f.x=1&brand=b&f.x=2"),
	);
	assert.equal(facetSelectionSignature(a), facetSelectionSignature(b));
	assert.equal(facetSelectionSignature(a), "brand=a&brand=b&f.x=1&f.x=2");
});

test("мусор отбрасывается синтаксически: ключи, значения, диапазоны", () => {
	const selection = readFacetSelection({
		brand: ["ok", "Не ASCII", "a b"],
		discount: "yes",
		"f.Bad Key": "1",
		"f.x": "<script>",
		"f.r": "abc~def",
		"f.s": "~",
	});
	assert.deepEqual(selection, { brands: ["ok"], discount: false, specs: {} });
});

test("границы диапазона, заданные наоборот, меняются местами; пустая — не задана", () => {
	assert.deepEqual(
		readFacetSelection(new URLSearchParams("f.m=10~2")).specs.m,
		{
			min: 2,
			max: 10,
		},
	);
	assert.deepEqual(readFacetSelection(new URLSearchParams("f.m=~5")).specs.m, {
		min: undefined,
		max: 5,
	});
});

test("число значений ограничено — перебором адрес не раздуть", () => {
	const values = new URLSearchParams();
	for (let i = 0; i < 100; i++) values.append("f.x", `v${i}`);
	assert.equal(readFacetSelection(values).specs.x?.values?.length, 20);

	const keys = new URLSearchParams();
	for (let i = 0; i < 100; i++) keys.append(`f.k${i}`, "1");
	assert.equal(Object.keys(readFacetSelection(keys).specs).length, 16);
});

test("запись заменяет прежние фасеты и не трогает остальные параметры", () => {
	const params = new URLSearchParams("sort=price&brand=old&f.y=1");
	writeFacetSelection(params, {
		brands: ["new"],
		discount: false,
		specs: { m: { min: 1 } },
	});
	assert.equal(params.toString(), "sort=price&brand=new&f.m=1%7E");
	assert.equal(countFacetSelection(readFacetSelection(params)), 2);
});
