/**
 * Локальная замена апстрима подсказок DaData для E2E.
 *
 * Существует, чтобы сквозные тесты проверяли ВЕСЬ путь запроса — браузер →
 * наш роут /api/address/suggest (сессия, лимит частоты, кэш, маппинг) →
 * апстрим, — не выходя в сеть и не тратя дневную квоту реального аккаунта.
 * Формат ответа повторяет реальный: {suggestions: [{value, data}]}.
 *
 * Поведение выбирается по тексту запроса — так тест управляет апстримом, не
 * имея к нему прямого доступа:
 *   «сбой»     → 500
 *   «лимит»    → 403 (исчерпана квота либо неверный ключ)
 *   «медленно» → ответ дольше клиентского таймаута
 *   «пусто»    → 200 с пустым списком
 *   иначе      → подсказки по префиксу из фикстур ниже
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_DADATA_PORT ?? 4599);

/** Дом определён — подсказку можно принять как финальный адрес. */
const MOSCOW_HOUSE = {
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
		fias_id: "e2e-fias-moscow-10",
		fias_level: "8",
		kladr_id: "7700000000000000000",
		geo_lat: "55.7558",
		geo_lon: "37.6173",
		qc_geo: "0",
	},
};

const MOSCOW_HOUSE_12 = {
	value: "г Москва, ул Ленина, д 12",
	unrestricted_value: "101001, г Москва, ул Ленина, д 12",
	data: {
		postal_code: "101001",
		country: "Россия",
		region_with_type: "г Москва",
		city_with_type: "г Москва",
		street_with_type: "ул Ленина",
		house_type: "д",
		house: "12",
		fias_id: "e2e-fias-moscow-12",
		fias_level: "8",
		kladr_id: "7700000000000000001",
		geo_lat: "55.7560",
		geo_lon: "37.6180",
		qc_geo: "0",
	},
};

/** Улица без дома — подсказка неполная, форма обязана попросить номер дома. */
const MOSCOW_STREET = {
	value: "г Москва, ул Ленина",
	data: {
		country: "Россия",
		region_with_type: "г Москва",
		city_with_type: "г Москва",
		street_with_type: "ул Ленина",
		fias_id: "e2e-fias-moscow-street",
		fias_level: "7",
	},
};

/** Сельский адрес: города нет, есть населённый пункт. */
const VILLAGE = {
	value: "Московская обл, Одинцовский р-н, д Юдино, ул Лесная, д 3",
	data: {
		postal_code: "143000",
		country: "Россия",
		region_with_type: "Московская обл",
		area_with_type: "Одинцовский р-н",
		settlement_with_type: "д Юдино",
		street_with_type: "ул Лесная",
		house_type: "д",
		house: "3",
		fias_id: "e2e-fias-village",
		fias_level: "8",
	},
};

/** Адрес без индекса — проверяет отдельное сообщение про индекс. */
const NO_POSTAL_CODE = {
	value: "Тверская обл, г Ржев, ул Новая, д 1",
	data: {
		country: "Россия",
		region_with_type: "Тверская обл",
		city_with_type: "г Ржев",
		street_with_type: "ул Новая",
		house_type: "д",
		house: "1",
		fias_id: "e2e-fias-rzhev",
		fias_level: "8",
	},
};

function suggestionsFor(query) {
	const q = query.toLowerCase();
	if (q.includes("юдино") || q.includes("одинцов")) return [VILLAGE];
	if (q.includes("ржев")) return [NO_POSTAL_CODE];
	if (q.includes("ленина"))
		return [MOSCOW_HOUSE, MOSCOW_HOUSE_12, MOSCOW_STREET];
	if (q.includes("москва"))
		return [MOSCOW_STREET, MOSCOW_HOUSE, MOSCOW_HOUSE_12];
	return [MOSCOW_HOUSE];
}

const server = createServer((req, res) => {
	let raw = "";
	req.on("data", (chunk) => {
		raw += chunk;
	});
	req.on("end", async () => {
		if (req.headers.authorization !== `Token ${process.env.DADATA_API_KEY}`) {
			res.writeHead(401).end("");
			return;
		}

		let query = "";
		try {
			query = String(JSON.parse(raw || "{}").query ?? "");
		} catch {
			res.writeHead(400).end("");
			return;
		}

		const q = query.toLowerCase();

		if (q.includes("сбой")) {
			res.writeHead(500).end("");
			return;
		}
		if (q.includes("лимит")) {
			res.writeHead(403).end("");
			return;
		}
		if (q.includes("медленно")) {
			// Дольше клиентского таймаута — проверяет ветку timeout.
			await new Promise((resolve) => setTimeout(resolve, 6000));
		}
		if (q.includes("пусто")) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ suggestions: [] }));
			return;
		}

		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ suggestions: suggestionsFor(query) }));
	});
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`mock-dadata listening on http://127.0.0.1:${PORT}`);
});
