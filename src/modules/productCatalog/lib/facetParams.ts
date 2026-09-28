import type { FacetSelection, SpecSelection } from "../types/filters";

/**
 * Формат фасетов в адресе каталога — общий для сервера и клиента.
 *
 *   brand=npo-polet&brand=…     производитель (несколько — ИЛИ)
 *   discount=1                  только со скидкой
 *   f.<ключ>=<значение>&…       характеристика-список (несколько — ИЛИ)
 *   f.<ключ>=10~50 | 10~ | ~50  характеристика-диапазон, в единицах показа
 *
 * Ключи и значения — нормализованные slug'и из specNormalization.ts:
 * ASCII, без пробелов, предсказуемые. Параметры пишутся в каноническом
 * порядке (writeFacetSelection), поэтому один и тот же выбор даёт один и тот
 * же адрес — важно и для кэша запросов на клиенте, и для склейки дублей.
 *
 * Здесь — только синтаксическая проверка и жёсткие лимиты. Существуют ли
 * такой ключ и такое значение в разделе, проверяет сервер по фасетам раздела
 * (sanitizeFacetSelection): неизвестное молча отбрасывается и ни в запрос, ни
 * в ключ кэша не попадает.
 */

export const BRAND_PARAM = "brand";
export const DISCOUNT_PARAM = "discount";
export const SPEC_PARAM_PREFIX = "f.";
const RANGE_SEPARATOR = "~";

const MAX_VALUES_PER_FACET = 20;
const MAX_SPEC_FACETS = 16;
const KEY_PATTERN = /^[a-z0-9-]{1,64}$/;
const VALUE_PATTERN = /^[a-z0-9.+-]{1,100}$/;

type RawParams =
	| URLSearchParams
	| Record<string, string | string[] | undefined>;

export const EMPTY_FACET_SELECTION: FacetSelection = {
	brands: [],
	discount: false,
	specs: {},
};

function entriesOf(params: RawParams): [string, string][] {
	if (params instanceof URLSearchParams) return [...params.entries()];
	const result: [string, string][] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue;
		for (const item of Array.isArray(value) ? value : [value]) {
			result.push([key, item]);
		}
	}
	return result;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort().slice(0, MAX_VALUES_PER_FACET);
}

function parseBound(raw: string): number | undefined {
	if (raw.trim() === "") return undefined;
	const n = Number(raw);
	return Number.isFinite(n) ? n : undefined;
}

function parseRange(raw: string): SpecSelection | null {
	const parts = raw.split(RANGE_SEPARATOR);
	if (parts.length !== 2) return null;
	let min = parseBound(parts[0]);
	let max = parseBound(parts[1]);
	if (min === undefined && max === undefined) return null;
	if (min !== undefined && max !== undefined && min > max) {
		[min, max] = [max, min];
	}
	return { min, max };
}

/** Фасеты из query-строки (URLSearchParams или searchParams страницы). */
export function readFacetSelection(params: RawParams): FacetSelection {
	const brands: string[] = [];
	const specValues = new Map<string, string[]>();
	const specRanges = new Map<string, SpecSelection>();
	let discount = false;

	for (const [key, value] of entriesOf(params)) {
		if (key === BRAND_PARAM) {
			if (KEY_PATTERN.test(value)) brands.push(value);
		} else if (key === DISCOUNT_PARAM) {
			discount = value === "1";
		} else if (key.startsWith(SPEC_PARAM_PREFIX)) {
			const facetKey = key.slice(SPEC_PARAM_PREFIX.length);
			if (!KEY_PATTERN.test(facetKey)) continue;
			if (value.includes(RANGE_SEPARATOR)) {
				const range = parseRange(value);
				if (range) specRanges.set(facetKey, range);
			} else if (VALUE_PATTERN.test(value)) {
				specValues.set(facetKey, [...(specValues.get(facetKey) ?? []), value]);
			}
		}
	}

	const specs: Record<string, SpecSelection> = {};
	const keys = [...new Set([...specValues.keys(), ...specRanges.keys()])]
		.sort()
		.slice(0, MAX_SPEC_FACETS);
	for (const key of keys) {
		// Один фасет — один вид выбора: диапазон приоритетнее, смешанный адрес
		// можно получить только руками.
		specs[key] = specRanges.get(key) ?? {
			values: uniqueSorted(specValues.get(key) ?? []),
		};
	}

	return { brands: uniqueSorted(brands), discount, specs };
}

function formatBound(value: number | undefined): string {
	return value === undefined ? "" : String(value);
}

/**
 * Записывает фасеты в params в каноническом порядке, предварительно удалив
 * все прежние фасетные параметры. Прочие параметры (цена, сортировка) не
 * трогает.
 */
export function writeFacetSelection(
	params: URLSearchParams,
	selection: FacetSelection,
): void {
	for (const key of [...params.keys()]) {
		if (
			key === BRAND_PARAM ||
			key === DISCOUNT_PARAM ||
			key.startsWith(SPEC_PARAM_PREFIX)
		) {
			params.delete(key);
		}
	}
	for (const brand of uniqueSorted(selection.brands)) {
		params.append(BRAND_PARAM, brand);
	}
	if (selection.discount) params.set(DISCOUNT_PARAM, "1");
	for (const key of Object.keys(selection.specs).sort()) {
		const spec = selection.specs[key];
		const name = `${SPEC_PARAM_PREFIX}${key}`;
		if (spec.min !== undefined || spec.max !== undefined) {
			params.set(
				name,
				`${formatBound(spec.min)}${RANGE_SEPARATOR}${formatBound(spec.max)}`,
			);
		} else {
			for (const value of uniqueSorted(spec.values ?? [])) {
				params.append(name, value);
			}
		}
	}
}

/** Каноническая строка выбора — для ключей кэша и сравнения. */
export function facetSelectionSignature(selection: FacetSelection): string {
	const params = new URLSearchParams();
	writeFacetSelection(params, selection);
	return params.toString();
}

/** Число снимаемых по одному условий — столько же чипов в строке фильтров. */
export function countFacetSelection(selection: FacetSelection): number {
	let count = selection.brands.length + (selection.discount ? 1 : 0);
	for (const spec of Object.values(selection.specs)) {
		count +=
			spec.min !== undefined || spec.max !== undefined
				? 1
				: (spec.values?.length ?? 0);
	}
	return count;
}

export function isFacetSelectionEmpty(selection: FacetSelection): boolean {
	return countFacetSelection(selection) === 0;
}
