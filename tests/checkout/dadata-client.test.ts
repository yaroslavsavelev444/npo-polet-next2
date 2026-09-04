import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
	fetchAddressSuggestions,
	isDadataConfigured,
	mapSuggestion,
} from "../../src/modules/checkout/server/dadata-client.ts";

/**
 * Клиент подсказок адресов.
 *
 * Проверяются две вещи, которые ломаются тише всего:
 *  • маппинг ответа провайдера в доменную модель — ошибка здесь молча
 *    записывает в заказ неправильный адрес;
 *  • поведение при отказах — подсказки вспомогательные, и любая сетевая
 *    проблема обязана превращаться в «введите вручную», а не в исключение,
 *    которое уронит оформление заказа.
 *
 * Сеть не используется: global.fetch подменяется.
 *
 * Запуск: pnpm test:checkout
 */

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.DADATA_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	process.env.DADATA_API_KEY = "test-key";
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_KEY === undefined) delete process.env.DADATA_API_KEY;
	else process.env.DADATA_API_KEY = ORIGINAL_KEY;
});

// ── Маппинг ─────────────────────────────────────────────────────────────────

test("mapSuggestion разбирает полный городской адрес до дома", () => {
	const suggestion = mapSuggestion({
		value: "г Москва, ул Ленина, д 10",
		unrestricted_value: "101000, г Москва, ул Ленина, д 10",
		data: {
			postal_code: "101000",
			country: "Россия",
			region_with_type: "г Москва",
			city_with_type: "г Москва",
			street_with_type: "ул Ленина",
			house_type: "д",
			house: "10",
			fias_id: "abc-123",
			fias_level: "8",
			kladr_id: "7700000000000",
			geo_lat: "55.7558",
			geo_lon: "37.6173",
			qc_geo: "0",
		},
	});

	assert.ok(suggestion);
	assert.equal(suggestion.label, "г Москва, ул Ленина, д 10");
	assert.equal(suggestion.isComplete, true);
	assert.equal(suggestion.id, "abc-123");
	assert.equal(suggestion.address.fullAddress, "г Москва, ул Ленина, д 10");
	assert.equal(suggestion.address.postalCode, "101000");
	assert.equal(suggestion.address.city, "г Москва");
	assert.equal(suggestion.address.street, "ул Ленина");
	assert.equal(suggestion.address.house, "10");
	assert.equal(suggestion.address.fiasId, "abc-123");
	assert.equal(suggestion.address.geoLat, "55.7558");
	assert.equal(suggestion.address.source, "dadata");
});

test("подсказка до улицы помечается как неполная", () => {
	// Такую подсказку нельзя принять как финальный адрес: форма обязана
	// попросить номер дома.
	const suggestion = mapSuggestion({
		value: "г Москва, ул Ленина",
		data: { city_with_type: "г Москва", street_with_type: "ул Ленина" },
	});

	assert.ok(suggestion);
	assert.equal(suggestion.isComplete, false);
	assert.equal(suggestion.address.house, "");
});

test("сельский адрес: город пуст, населённый пункт заполнен", () => {
	// Реальный случай, на котором старая проверка «город обязателен»
	// отклоняла корректный адрес.
	const suggestion = mapSuggestion({
		value: "Московская обл, Одинцовский р-н, д Юдино, ул Лесная, д 3",
		data: {
			region_with_type: "Московская обл",
			area_with_type: "Одинцовский р-н",
			settlement_with_type: "д Юдино",
			street_with_type: "ул Лесная",
			house: "3",
		},
	});

	assert.ok(suggestion);
	assert.equal(suggestion.address.city, "");
	assert.equal(suggestion.address.settlement, "д Юдино");
	assert.equal(suggestion.address.region, "Московская обл");
	assert.equal(suggestion.isComplete, true);
});

test("квартира из ответа провайдера в форму не переносится", () => {
	// Квартира вводится отдельным полем: если тянуть её из подсказки, выбор
	// другого дома затирал бы уже введённый пользователем номер.
	const suggestion = mapSuggestion({
		value: "г Москва, ул Ленина, д 10, кв 5",
		data: { house: "10", flat: "5" },
	});

	assert.ok(suggestion);
	assert.equal(suggestion.address.apartment, "");
	assert.equal(suggestion.address.entrance, "");
	assert.equal(suggestion.address.floor, "");
});

test("уточнение не повторяет то, что уже есть в основной строке", () => {
	const withRegionInLabel = mapSuggestion({
		value: "г Москва, ул Ленина",
		data: { region_with_type: "г Москва" },
	});
	assert.equal(withRegionInLabel?.hint, "");

	const withRegionOutside = mapSuggestion({
		value: "Одинцово, ул Лесная",
		data: { region_with_type: "Московская обл" },
	});
	assert.equal(withRegionOutside?.hint, "Московская обл");
});

test("подсказка без значения отбрасывается", () => {
	// Показывать пустую строку в списке нельзя — её нельзя ни прочитать, ни
	// осмысленно выбрать.
	assert.equal(mapSuggestion({ value: "", data: {} }), null);
	assert.equal(mapSuggestion({}), null);
});

test("id устойчив к отсутствию fias_id", () => {
	assert.equal(
		mapSuggestion({ value: "г Москва", data: { kladr_id: "7700000000000" } })
			?.id,
		"7700000000000",
	);
	assert.equal(mapSuggestion({ value: "г Москва", data: {} })?.id, "г Москва");
});

// ── Сетевое поведение ───────────────────────────────────────────────────────

test("без ключа запрос вообще не выполняется", async () => {
	delete process.env.DADATA_API_KEY;
	let called = false;
	globalThis.fetch = async () => {
		called = true;
		return jsonResponse({});
	};

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.equal(called, false);
	assert.deepEqual(result, { ok: false, reason: "not_configured" });
	assert.equal(isDadataConfigured(), false);
});

test("успешный ответ отдаёт разобранные подсказки", async () => {
	globalThis.fetch = async () =>
		jsonResponse({
			suggestions: [
				{ value: "г Москва", data: { city_with_type: "г Москва" } },
				{ value: "", data: {} },
			],
		});

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.equal(result.ok, true);
	assert.ok(result.ok);
	// Пустая подсказка отфильтрована, а не превращена в пустую строку списка.
	assert.equal(result.suggestions.length, 1);
	assert.equal(result.suggestions[0].label, "г Москва");
});

test("ключ уходит в заголовок Authorization и не попадает в тело", async () => {
	let capturedInit: RequestInit | undefined;
	globalThis.fetch = async (_url, init) => {
		capturedInit = init;
		return jsonResponse({ suggestions: [] });
	};

	await fetchAddressSuggestions({ query: "москва", count: 5, toBound: "city" });

	const headers = capturedInit?.headers as Record<string, string>;
	assert.equal(headers.Authorization, "Token test-key");
	const body = JSON.parse(String(capturedInit?.body));
	assert.equal(body.query, "москва");
	assert.equal(body.count, 5);
	assert.deepEqual(body.to_bound, { value: "city" });
	assert.equal("Authorization" in body, false);
});

test("count ограничивается допустимым диапазоном провайдера", async () => {
	const captured: number[] = [];
	globalThis.fetch = async (_url, init) => {
		captured.push(JSON.parse(String(init?.body)).count);
		return jsonResponse({ suggestions: [] });
	};

	await fetchAddressSuggestions({ query: "москва", count: 999 });
	await fetchAddressSuggestions({ query: "москва", count: 0 });

	// Больше 20 провайдер отвечает 400 — обрезаем на своей стороне.
	assert.deepEqual(captured, [20, 1]);
});

test("запрос длиннее 300 символов обрезается до лимита провайдера", async () => {
	let sentQuery = "";
	globalThis.fetch = async (_url, init) => {
		sentQuery = JSON.parse(String(init?.body)).query;
		return jsonResponse({ suggestions: [] });
	};

	await fetchAddressSuggestions({ query: "м".repeat(400) });

	assert.equal(sentQuery.length, 300);
});

test("пустой запрос не тратит квоту", async () => {
	let called = false;
	globalThis.fetch = async () => {
		called = true;
		return jsonResponse({ suggestions: [] });
	};

	const result = await fetchAddressSuggestions({ query: "   " });

	assert.equal(called, false);
	assert.deepEqual(result, { ok: true, suggestions: [] });
});

test("401/403 — исчерпанная квота или неверный ключ", async () => {
	for (const status of [401, 403]) {
		globalThis.fetch = async () => new Response("", { status });
		const result = await fetchAddressSuggestions({ query: "москва" });
		assert.deepEqual(result, { ok: false, reason: "unauthorized" });
	}
});

test("429 — превышена частота запросов", async () => {
	globalThis.fetch = async () => new Response("", { status: 429 });
	const result = await fetchAddressSuggestions({ query: "москва" });
	assert.deepEqual(result, { ok: false, reason: "rate_limited" });
});

test("5xx не бросает исключение", async () => {
	globalThis.fetch = async () => new Response("", { status: 500 });
	const result = await fetchAddressSuggestions({ query: "москва" });
	assert.deepEqual(result, { ok: false, reason: "upstream_error" });
});

test("таймаут отличается от прочих сетевых сбоев", async () => {
	globalThis.fetch = async () => {
		throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
	};

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.deepEqual(result, { ok: false, reason: "timeout" });
});

test("обрыв сети не роняет оформление заказа", async () => {
	globalThis.fetch = async () => {
		throw new TypeError("fetch failed");
	};

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.deepEqual(result, { ok: false, reason: "upstream_error" });
});

test("битый JSON обрабатывается как сбой провайдера", async () => {
	globalThis.fetch = async () =>
		new Response("<html>502</html>", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.deepEqual(result, { ok: false, reason: "upstream_error" });
});

test("неожиданная форма ответа трактуется как «подсказок нет»", async () => {
	// Не ошибка: форма продолжает работать, просто без подсказок.
	globalThis.fetch = async () => jsonResponse({ suggestions: "нет" });

	const result = await fetchAddressSuggestions({ query: "москва" });

	assert.deepEqual(result, { ok: true, suggestions: [] });
});
