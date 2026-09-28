import type { CheckoutAddress } from "../lib/address";
import type {
	AddressSuggestion,
	CompanyRegistryStatus,
	CompanySuggestion,
} from "../types";

/**
 * Клиент подсказок DaData: адреса и организации.
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
 * Модуль импортируется ТОЛЬКО из серверного кода (app/api/address/suggest,
 * app/api/company/suggest).
 * Ключ читается из `process.env.DADATA_API_KEY` без префикса NEXT_PUBLIC_,
 * поэтому даже при случайном импорте в клиентский компонент значение в бандл
 * не попадёт — Next.js подставляет в клиент только NEXT_PUBLIC_*-переменные.
 */

const DADATA_DEFAULT_URL =
	"https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address";
const DADATA_PARTY_DEFAULT_URL =
	"https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party";

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

/**
 * То же для подсказок организаций. Отдельная переменная, а не производная от
 * DADATA_SUGGEST_URL: та уже указывает на конкретный метод (адреса), и
 * вычислять из неё соседний путь значило бы менять смысл существующей
 * настройки.
 */
function resolvePartySuggestUrl(): string {
	return (
		process.env.DADATA_PARTY_SUGGEST_URL?.trim() || DADATA_PARTY_DEFAULT_URL
	);
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

export type CompanyDadataResult =
	| { ok: true; suggestions: CompanySuggestion[] }
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

type DadataRawResult =
	| { ok: true; suggestions: unknown[] }
	| { ok: false; reason: DadataFailureReason };

/**
 * Общий транспорт подсказок: ключ, таймаут, разбор кодов ответа. Адреса и
 * организации отличаются только URL, телом запроса и маппингом, а отказы
 * DaData (лимит, неверный ключ, сбой) одинаковы для всех методов — и
 * обрабатываться должны одинаково.
 *
 * Никогда не бросает: любая проблема — это `{ ok: false }`, потому что
 * недоступность подсказок не должна мешать оформить заказ с данными,
 * введёнными вручную.
 */
async function requestSuggestions(
	url: string,
	body: Record<string, unknown>,
): Promise<DadataRawResult> {
	const apiKey = process.env.DADATA_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "not_configured" };

	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: `Token ${apiKey}`,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			// Ответ зависит от ключа и меняется вместе со справочниками —
			// кэш Next.js здесь только мешает; своё кэширование живёт в роутах.
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
	// Неожиданная форма ответа не должна ломать форму — считаем, что
	// подсказок нет.
	return {
		ok: true,
		suggestions: Array.isArray(rawSuggestions) ? rawSuggestions : [],
	};
}

function clampCount(count: number | undefined): number {
	return Math.min(Math.max(count ?? DEFAULT_COUNT, 1), MAX_SUGGESTION_COUNT);
}

/**
 * Запрашивает подсказки адреса у DaData. Никогда не бросает — см.
 * requestSuggestions.
 */
export async function fetchAddressSuggestions(
	options: FetchSuggestionsOptions,
): Promise<DadataResult> {
	if (!isDadataConfigured()) return { ok: false, reason: "not_configured" };

	const query = options.query.trim().slice(0, MAX_QUERY_LENGTH);
	if (!query) return { ok: true, suggestions: [] };

	const result = await requestSuggestions(resolveSuggestUrl(), {
		query,
		count: clampCount(options.count),
		...(options.locations ? { locations: options.locations } : {}),
		...(options.fromBound ? { from_bound: { value: options.fromBound } } : {}),
		...(options.toBound ? { to_bound: { value: options.toBound } } : {}),
	});
	if (!result.ok) return result;

	const suggestions = result.suggestions
		.map((item) => mapSuggestion(item as DadataSuggestion))
		.filter((item): item is AddressSuggestion => item !== null);

	return { ok: true, suggestions };
}

// ── Организации (suggest/party) ─────────────────────────────────────────────
//
// Метод входит во все тарифы DaData, включая бесплатный, и расходует ту же
// дневную квоту аккаунта, что и адреса (10 000 запросов в сутки на
// бесплатном). Поля, которые здесь используются — название, адрес, ИНН, КПП,
// ОГРН, статус и текущий руководитель (`management`), — отдаются на любом
// тарифе; только на «Максимальном» доступны `managers`/`founders`, и они не
// нужны.

/** Поля ответа suggest/party, которые реально используются. */
interface DadataPartyData {
	inn?: string | null;
	kpp?: string | null;
	ogrn?: string | null;
	hid?: string | null;
	/** LEGAL — юрлицо, INDIVIDUAL — ИП. */
	type?: string | null;
	/** MAIN — головная организация, BRANCH — филиал. */
	branch_type?: string | null;
	name?: {
		full_with_opf?: string | null;
		short_with_opf?: string | null;
	} | null;
	management?: { name?: string | null; post?: string | null } | null;
	fio?: {
		surname?: string | null;
		name?: string | null;
		patronymic?: string | null;
	} | null;
	state?: { status?: string | null } | null;
	address?: {
		value?: string | null;
		unrestricted_value?: string | null;
		data?: {
			city_with_type?: string | null;
			region_with_type?: string | null;
		} | null;
	} | null;
}

interface DadataPartySuggestion {
	value?: string | null;
	data?: DadataPartyData | null;
}

const PARTY_STATUSES: readonly CompanyRegistryStatus[] = [
	"ACTIVE",
	"LIQUIDATING",
	"LIQUIDATED",
	"BANKRUPT",
	"REORGANIZING",
];

function partyStatus(value: string | null | undefined): CompanyRegistryStatus {
	const status = text(value).toUpperCase() as CompanyRegistryStatus;
	// Неизвестный статус не должен выглядеть как «действующая»: пусть лучше
	// пользователь увидит предупреждение, чем выставит счёт ликвидированной.
	return PARTY_STATUSES.includes(status) ? status : "UNKNOWN";
}

/**
 * Преобразует подсказку suggest/party в доменные реквизиты.
 *
 * Экспортируется отдельно от сетевого вызова, чтобы маппинг покрывался
 * тестами без сети и без ключа.
 */
export function mapPartySuggestion(
	suggestion: DadataPartySuggestion,
): CompanySuggestion | null {
	if (!suggestion || typeof suggestion !== "object") return null;
	const data = suggestion.data ?? {};
	const inn = text(data.inn);
	const label = text(suggestion.value) || text(data.name?.short_with_opf);
	// Без ИНН реквизиты бесполезны: счёт без него не выставить.
	if (!inn || !label) return null;

	const kpp = text(data.kpp);
	const isIndividual = text(data.type).toUpperCase() === "INDIVIDUAL";
	// У ИП руководителя в ЕГРИП нет — подписывает сам предприниматель.
	const director = isIndividual
		? [data.fio?.surname, data.fio?.name, data.fio?.patronymic]
				.map(text)
				.filter(Boolean)
				.join(" ")
		: text(data.management?.name);
	const address =
		text(data.address?.unrestricted_value) || text(data.address?.value);
	const city =
		text(data.address?.data?.city_with_type) ||
		text(data.address?.data?.region_with_type);

	return {
		// hid — стабильный идентификатор записи DaData; ИНН+КПП различает
		// головную организацию и филиалы, у которых ИНН общий.
		id: text(data.hid) || `${inn}:${kpp}`,
		label,
		inn,
		city,
		status: partyStatus(data.state?.status),
		isBranch: text(data.branch_type).toUpperCase() === "BRANCH",
		isIndividual,
		requisites: {
			companyName: text(data.name?.full_with_opf) || label,
			legalAddress: address,
			taxNumber: inn,
			kpp,
			ogrn: text(data.ogrn),
			director,
			directorPost: isIndividual ? "" : text(data.management?.post),
		},
	};
}

/**
 * Запрашивает подсказки организаций у DaData. Никогда не бросает — см.
 * requestSuggestions.
 */
export async function fetchCompanySuggestions(options: {
	query: string;
	count?: number;
}): Promise<CompanyDadataResult> {
	if (!isDadataConfigured()) return { ok: false, reason: "not_configured" };

	const query = options.query.trim().slice(0, MAX_QUERY_LENGTH);
	if (!query) return { ok: true, suggestions: [] };

	const result = await requestSuggestions(resolvePartySuggestUrl(), {
		query,
		count: clampCount(options.count),
	});
	if (!result.ok) return result;

	const suggestions = result.suggestions
		.map((item) => mapPartySuggestion(item as DadataPartySuggestion))
		.filter((item): item is CompanySuggestion => item !== null);

	return { ok: true, suggestions };
}

/**
 * Причина отказа клиента → причина деградации в ответе роута. Общая для всех
 * роутов подсказок: пользователю в каждом из них нужен один и тот же выбор —
 * повторить или ввести вручную.
 */
export function toDegradeReason(
	reason: DadataFailureReason,
): "not_configured" | "rate_limited" | "unavailable" {
	if (reason === "not_configured") return "not_configured";
	if (reason === "rate_limited") return "rate_limited";
	// unauthorized у DaData означает и неверный ключ, и исчерпанную квоту:
	// пользователю в обоих случаях нужен ручной ввод, а не разные тексты.
	return "unavailable";
}
