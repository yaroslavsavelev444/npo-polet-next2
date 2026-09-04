import type { CheckoutAddress } from "../lib/address";
import type { AddressSuggestion } from "../types";

/**
 * Клиент подсказок адресов DaData.
 *
 * Почему запрос идёт с сервера, а не напрямую из браузера:
 *
 *  1. Ключ. DaData аутентифицирует подсказки заголовком `Authorization:
 *     Token <key>` и не поддерживает ни доменные ограничения, ни ротацию
 *     на стороне клиента. Ключ в бандле = чужие 10 000 запросов в сутки на
 *     нашем аккаунте и отключённые подсказки в оформлении заказа.
 *  2. Лимиты. Общий дневной лимит один на весь аккаунт, и превышение
 *     возвращает 403 до следующих суток по Москве. Только на сервере можно
 *     поставить перед ним rate limit и кэш.
 *  3. Контракт. Наружу отдаётся доменная модель (см. lib/address.ts), а не
 *     сырой ответ DaData: смена провайдера подсказок не затрагивает ни
 *     форму, ни коллекцию заказов.
 *  4. Тестируемость. Маппинг — чистая функция, которую можно проверить
 *     юнит-тестом без сети (tests/checkout/dadata-client.test.ts).
 *
 * Модуль импортируется ТОЛЬКО из серверного кода (app/api/address/suggest).
 * Ключ читается из `process.env.DADATA_API_KEY` без префикса NEXT_PUBLIC_,
 * поэтому даже при случайном импорте в клиентский компонент значение в бандл
 * не попадёт — Next.js подставляет в клиент только NEXT_PUBLIC_*-переменные.
 */

const DADATA_DEFAULT_URL =
	"https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";

/**
 * Адрес апстрима. Переопределяется только серверной переменной окружения —
 * тем же способом и с тем же уровнем доверия, что и сам ключ. Нужен, чтобы
 * E2E прогоняли ВЕСЬ путь запроса (браузер → наш роут → апстрим) против
 * локального мока: без этого сквозные тесты подсказок либо ходили бы в
 * DaData по сети (медленно, нестабильно, тратит квоту), либо не проверяли
 * бы роут вовсе.
 */
function resolveSuggestUrl(): string {
	return process.env.DADATA_SUGGEST_URL?.trim() || DADATA_DEFAULT_URL;
}

/** DaData режет запрос по 300 символам — обрезаем заранее. */
export const MAX_QUERY_LENGTH = 300;
/** Максимум, который принимает API. Больше — ошибка 400. */
export const MAX_SUGGESTION_COUNT = 20;
const DEFAULT_COUNT = 8;
/**
 * Подсказки — вспомогательный сервис: пользователь всегда может ввести адрес
 * руками. Ждать ответа дольше нескольких секунд бессмысленно, поэтому таймаут
 * жёсткий — иначе запрос висел бы до таймаута самого Next.js.
 */
const REQUEST_TIMEOUT_MS = 4000;

/** Поля ответа DaData, которые реально используются. Остальные игнорируем. */
interface DadataAddressData {
	postal_code?: string | null;
	country?: string | null;
	region_with_type?: string | null;
	region?: string | null;
	area_with_type?: string | null;
	city_with_type?: string | null;
	city?: string | null;
	settlement_with_type?: string | null;
	street_with_type?: string | null;
	street?: string | null;
	house_type?: string | null;
	house?: string | null;
	block_type?: string | null;
	block?: string | null;
	flat?: string | null;
	fias_id?: string | null;
	fias_level?: string | null;
	kladr_id?: string | null;
	geo_lat?: string | null;
	geo_lon?: string | null;
	qc_geo?: string | null;
}

interface DadataSuggestion {
	value?: string | null;
	unrestricted_value?: string | null;
	data?: DadataAddressData | null;
}

export type DadataFailureReason =
	| "not_configured"
	| "unauthorized"
	| "rate_limited"
	| "timeout"
	| "upstream_error";

export type DadataResult =
	| { ok: true; suggestions: AddressSuggestion[] }
	| { ok: false; reason: DadataFailureReason };

function text(value: string | null | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

/** Склеивает «ул» + «Ленина» → «ул Ленина», не оставляя лишних пробелов. */
function withType(
	type: string | null | undefined,
	value: string | null | undefined,
): string {
	const t = text(type);
	const v = text(value);
	if (!v) return "";
	return t ? `${t} ${v}` : v;
}

/**
 * Преобразует подсказку DaData в доменный адрес.
 *
 * Экспортируется отдельно от сетевого вызова, чтобы маппинг покрывался
 * тестами без сети и без ключа.
 */
export function mapSuggestion(
	suggestion: DadataSuggestion,
): AddressSuggestion | null {
	const data = suggestion.data ?? {};
	const label = text(suggestion.value) || text(suggestion.unrestricted_value);
	if (!label) return null;

	// Регион не показываем повторно, если он уже присутствует в основной
	// строке (для городов федерального значения value начинается с него).
	const regionLabel = text(data.region_with_type);
	const areaLabel = text(data.area_with_type);
	const hintParts = [regionLabel, areaLabel].filter(
		(part) => part && !label.includes(part),
	);

	const address: CheckoutAddress = {
		fullAddress: label,
		postalCode: text(data.postal_code),
		country: text(data.country) || "Россия",
		region: regionLabel,
		area: areaLabel,
		city: withType(null, data.city_with_type) || text(data.city),
		settlement: text(data.settlement_with_type),
		street: text(data.street_with_type) || text(data.street),
		house: text(data.house),
		block: text(data.block),
		// Квартиру DaData иногда возвращает, но в форме она живёт отдельным
		// полем «Данные для курьера» и подсказкой не управляется: иначе выбор
		// другого дома затирал бы уже введённый номер квартиры.
		apartment: "",
		entrance: "",
		floor: "",
		fiasId: text(data.fias_id),
		fiasLevel: text(data.fias_level),
		kladrId: text(data.kladr_id),
		geoLat: text(data.geo_lat),
		geoLon: text(data.geo_lon),
		qcGeo: text(data.qc_geo),
		source: "dadata",
	};

	return {
		id: text(data.fias_id) || text(data.kladr_id) || label,
		label,
		hint: hintParts.join(", "),
		isComplete: Boolean(address.house),
		address,
	};
}

export function isDadataConfigured(): boolean {
	return Boolean(process.env.DADATA_API_KEY?.trim());
}

export interface FetchSuggestionsOptions {
	query: string;
	count?: number;
	/** Ограничение поиска, например `[{ country: "*" }]`. */
	locations?: Array<Record<string, string>>;
	/** `city` — искать только города, `street` — до улицы и т.д. */
	fromBound?: string;
	toBound?: string;
}

/**
 * Запрашивает подсказки у DaData. Никогда не бросает: любая проблема —
 * это `{ ok: false }`, потому что недоступность подсказок не должна мешать
 * оформить заказ с адресом, введённым вручную.
 */
export async function fetchAddressSuggestions(
	options: FetchSuggestionsOptions,
): Promise<DadataResult> {
	const apiKey = process.env.DADATA_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "not_configured" };

	const query = options.query.trim().slice(0, MAX_QUERY_LENGTH);
	if (!query) return { ok: true, suggestions: [] };

	const count = Math.min(
		Math.max(options.count ?? DEFAULT_COUNT, 1),
		MAX_SUGGESTION_COUNT,
	);

	let response: Response;
	try {
		response = await fetch(resolveSuggestUrl(), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: `Token ${apiKey}`,
			},
			body: JSON.stringify({
				query,
				count,
				...(options.locations ? { locations: options.locations } : {}),
				...(options.fromBound
					? { from_bound: { value: options.fromBound } }
					: {}),
				...(options.toBound ? { to_bound: { value: options.toBound } } : {}),
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			// Ответ зависит от ключа и меняется вместе со справочником ФИАС —
			// кэш Next.js здесь только мешает; своё кэширование живёт в роуте.
			cache: "no-store",
		});
	} catch (error) {
		const isTimeout =
			error instanceof Error &&
			(error.name === "TimeoutError" || error.name === "AbortError");
		if (!isTimeout) {
			console.error("[dadata] network error:", error);
		}
		return { ok: false, reason: isTimeout ? "timeout" : "upstream_error" };
	}

	if (response.status === 401 || response.status === 403) {
		// 403 у DaData означает и «неверный ключ», и «исчерпан дневной лимит»:
		// различить их по ответу нельзя, поэтому наверх уходит один код, а
		// пользователю в обоих случаях предлагается ручной ввод.
		console.error(`[dadata] auth/limit error: HTTP ${response.status}`);
		return { ok: false, reason: "unauthorized" };
	}
	if (response.status === 429) return { ok: false, reason: "rate_limited" };
	if (!response.ok) {
		console.error(`[dadata] unexpected status: HTTP ${response.status}`);
		return { ok: false, reason: "upstream_error" };
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		console.error("[dadata] malformed JSON:", error);
		return { ok: false, reason: "upstream_error" };
	}

	const rawSuggestions = (payload as { suggestions?: unknown })?.suggestions;
	if (!Array.isArray(rawSuggestions)) {
		// Неожиданная форма ответа не должна ломать форму — считаем, что
		// подсказок нет.
		return { ok: true, suggestions: [] };
	}

	const suggestions = rawSuggestions
		.map((item) => mapSuggestion(item as DadataSuggestion))
		.filter((item): item is AddressSuggestion => item !== null);

	return { ok: true, suggestions };
}
