import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
	fetchAddressSuggestions,
	fetchCompanySuggestions,
	isDadataConfigured,
	mapPartySuggestion,
	mapSuggestion,
	toDegradeReason,
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
const ORIGINAL_SUGGEST_URL = process.env.DADATA_SUGGEST_URL;
const ORIGINAL_PARTY_URL = process.env.DADATA_PARTY_SUGGEST_URL;
const ORIGINAL_CONSOLE_ERROR = console.error;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Сценарии отказов ниже проверяют как раз те ветки, где клиент ПО ЗАМЫСЛУ
 * пишет в console.error (HTTP 401/403/500, сетевой сбой, битый JSON). В
 * прогоне тестов это давало полтора десятка строк «[dadata] auth/limit
 * error», «[dadata] network error» вперемешку со стек-трейсами — в логе CI
 * они неотличимы от настоящей аварии, и ровно на них уходит время при разборе
 * упавшей сборки.
 *
 * Вывод подавляется целиком, а не выборочно: любой console.error здесь —
 * ожидаемая часть проверяемого поведения. Если клиент перестанет логировать,
 * тесты этого не заметят — но они на это и не смотрят, они смотрят на
 * возвращаемое значение.
 */

beforeEach(() => {
	process.env.DADATA_API_KEY = "test-key";
	console.error = () => {};
});

afterEach(() => {
	console.error = ORIGINAL_CONSOLE_ERROR;
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_KEY === undefined) delete process.env.DADATA_API_KEY;
	else process.env.DADATA_API_KEY = ORIGINAL_KEY;
	if (ORIGINAL_SUGGEST_URL === undefined) delete process.env.DADATA_SUGGEST_URL;
	else process.env.DADATA_SUGGEST_URL = ORIGINAL_SUGGEST_URL;
	if (ORIGINAL_PARTY_URL === undefined)
		delete process.env.DADATA_PARTY_SUGGEST_URL;
	else process.env.DADATA_PARTY_SUGGEST_URL = ORIGINAL_PARTY_URL;
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

// ── Организации (suggest/party) ─────────────────────────────────────────────

/** Форма ответа suggest/party на бесплатном тарифе — только нужные поля. */
const SBERBANK = {
	value: "ПАО СБЕРБАНК",
	data: {
		inn: "7707083893",
		kpp: "773601001",
		ogrn: "1027700132195",
		hid: "145a83ab38c9ad95889a7b894ff57c8a6d4d8b8e8b0f0f2a0c1c5f1e0a1c1e1f",
		type: "LEGAL",
		branch_type: "MAIN",
		name: {
			full_with_opf: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"',
			short_with_opf: "ПАО СБЕРБАНК",
		},
		management: { name: "Греф Герман Оскарович", post: "ПРЕЗИДЕНТ" },
		state: { status: "ACTIVE" },
		address: {
			value: "г Москва, ул Вавилова, д 19",
			unrestricted_value: "117312, г Москва, ул Вавилова, д 19",
			data: { city_with_type: "г Москва", region_with_type: "г Москва" },
		},
	},
};

test("mapPartySuggestion раскладывает реквизиты юрлица", () => {
	const mapped = mapPartySuggestion(SBERBANK);
	assert.ok(mapped);
	assert.equal(mapped.label, "ПАО СБЕРБАНК");
	assert.equal(mapped.inn, "7707083893");
	assert.equal(mapped.city, "г Москва");
	assert.equal(mapped.status, "ACTIVE");
	assert.equal(mapped.isBranch, false);
	assert.deepEqual(mapped.requisites, {
		// Полное наименование с ОПФ — именно оно нужно в счёте.
		companyName: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"',
		// Адрес с индексом предпочтительнее короткого.
		legalAddress: "117312, г Москва, ул Вавилова, д 19",
		taxNumber: "7707083893",
		kpp: "773601001",
		ogrn: "1027700132195",
		director: "Греф Герман Оскарович",
		directorPost: "ПРЕЗИДЕНТ",
	});
});

test("ИП: без КПП, руководитель — сам предприниматель", () => {
	const mapped = mapPartySuggestion({
		value: "ИП Иванов Иван Иванович",
		data: {
			inn: "500100732259",
			ogrn: "304500116000157",
			type: "INDIVIDUAL",
			fio: { surname: "Иванов", name: "Иван", patronymic: "Иванович" },
			name: {
				full_with_opf: "Индивидуальный предприниматель Иванов Иван Иванович",
			},
			state: { status: "ACTIVE" },
			address: { value: "Московская обл, г Химки" },
		},
	});
	assert.ok(mapped);
	assert.equal(mapped.isIndividual, true);
	assert.equal(mapped.requisites.kpp, "");
	assert.equal(mapped.requisites.ogrn, "304500116000157");
	assert.equal(mapped.requisites.director, "Иванов Иван Иванович");
	assert.equal(mapped.requisites.directorPost, "");
	assert.equal(mapped.requisites.legalAddress, "Московская обл, г Химки");
});

test("филиал отличается от головной организации по id и флагу", () => {
	const branch = mapPartySuggestion({
		value: "ПАО СБЕРБАНК",
		data: {
			...SBERBANK.data,
			hid: undefined,
			kpp: "784243001",
			branch_type: "BRANCH",
		},
	});
	const main = mapPartySuggestion({
		...SBERBANK,
		data: { ...SBERBANK.data, hid: undefined },
	});
	assert.ok(branch && main);
	assert.equal(branch.isBranch, true);
	assert.notEqual(branch.id, main.id);
});

test("неизвестный статус не выдаётся за действующую организацию", () => {
	const mapped = mapPartySuggestion({
		...SBERBANK,
		data: { ...SBERBANK.data, state: { status: "SOMETHING_NEW" } },
	});
	assert.equal(mapped?.status, "UNKNOWN");

	const liquidated = mapPartySuggestion({
		...SBERBANK,
		data: { ...SBERBANK.data, state: { status: "liquidated" } },
	});
	assert.equal(liquidated?.status, "LIQUIDATED");
});

test("подсказка без ИНН или не-объект отбрасывается", () => {
	assert.equal(
		mapPartySuggestion({ value: "ООО Без ИНН", data: { kpp: "1" } }),
		null,
	);
	// biome-ignore lint/suspicious/noExplicitAny: проверяется мусор из ответа
	assert.equal(mapPartySuggestion(null as any), null);
});

test("fetchCompanySuggestions ходит в suggest/party, а не в адреса", async () => {
	process.env.DADATA_SUGGEST_URL = "http://mock/address";
	delete process.env.DADATA_PARTY_SUGGEST_URL;
	let calledUrl = "";
	let sentBody: Record<string, unknown> = {};
	globalThis.fetch = async (url, init) => {
		calledUrl = String(url);
		sentBody = JSON.parse(String(init?.body));
		return jsonResponse({ suggestions: [SBERBANK, { value: "мусор" }] });
	};

	const result = await fetchCompanySuggestions({
		query: " 7707083893 ",
		count: 7,
	});

	// Переопределение адресного апстрима не уводит организации туда же.
	assert.equal(
		calledUrl,
		"https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party",
	);
	assert.deepEqual(sentBody, { query: "7707083893", count: 7 });
	assert.ok(result.ok);
	assert.equal(result.suggestions.length, 1);
});

test("DADATA_PARTY_SUGGEST_URL подменяет апстрим организаций (E2E-мок)", async () => {
	process.env.DADATA_PARTY_SUGGEST_URL = "http://127.0.0.1:4599/suggest/party";
	let calledUrl = "";
	globalThis.fetch = async (url) => {
		calledUrl = String(url);
		return jsonResponse({ suggestions: [] });
	};
	await fetchCompanySuggestions({ query: "ромашка" });
	assert.equal(calledUrl, "http://127.0.0.1:4599/suggest/party");
});

test("адреса по-прежнему уважают DADATA_SUGGEST_URL", async () => {
	process.env.DADATA_SUGGEST_URL = "http://127.0.0.1:4599/suggest";
	process.env.DADATA_PARTY_SUGGEST_URL = "http://127.0.0.1:4599/suggest/party";
	let calledUrl = "";
	globalThis.fetch = async (url) => {
		calledUrl = String(url);
		return jsonResponse({ suggestions: [] });
	};
	await fetchAddressSuggestions({ query: "москва" });
	assert.equal(calledUrl, "http://127.0.0.1:4599/suggest");
});

test("отказы suggest/party обрабатываются как у адресов", async () => {
	delete process.env.DADATA_API_KEY;
	assert.deepEqual(await fetchCompanySuggestions({ query: "ромашка" }), {
		ok: false,
		reason: "not_configured",
	});

	process.env.DADATA_API_KEY = "test-key";
	globalThis.fetch = async () => new Response("", { status: 403 });
	assert.deepEqual(await fetchCompanySuggestions({ query: "ромашка" }), {
		ok: false,
		reason: "unauthorized",
	});

	globalThis.fetch = async () => {
		throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
	};
	assert.deepEqual(await fetchCompanySuggestions({ query: "ромашка" }), {
		ok: false,
		reason: "timeout",
	});
});

test("причины отказа сводятся к трём вариантам для формы", () => {
	assert.equal(toDegradeReason("not_configured"), "not_configured");
	assert.equal(toDegradeReason("rate_limited"), "rate_limited");
	assert.equal(toDegradeReason("unauthorized"), "unavailable");
	assert.equal(toDegradeReason("timeout"), "unavailable");
	assert.equal(toDegradeReason("upstream_error"), "unavailable");
});
