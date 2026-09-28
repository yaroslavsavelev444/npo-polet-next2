/**
 * Нормализация характеристик товара для фасетной фильтрации каталога.
 *
 * Характеристики (products.specifications) исторически — свободный текст:
 * «Напряжение питания» / «напряжение  питания» / «Напряжение питания, В»,
 * «0,4 кг» / «400 г» / «0.4» с единицей «кг» — для покупателя это одно и то же,
 * а для базы — разные строки. Фасеты по сырым строкам развалились бы на
 * дубли, поэтому каждая строка характеристики при сохранении товара получает
 * вычисленные ключи (хук normalizeProductForFacets, коллекция Products):
 *
 *   nameKey  — ключ характеристики: транслит нормализованного названия
 *              («napryazhenie-pitaniya»). Он же — имя параметра в URL.
 *   valueKey — ключ значения. Для чисел — число в БАЗОВОЙ единице плюс id
 *              единицы («220v», «0.4kg»), так что «0,4 кг» и «400 г» — одно
 *              значение; для текста — транслит («ip67»).
 *   valueNum — число в базовой единице (для диапазонных фасетов) или null.
 *   unitKey  — id базовой единицы («v», «kg», «hz») или null.
 *
 * Модуль чистый — без импортов: его подключают и коллекция Payload (CLI
 * Payload грузит её в обычном Node), и миграция, и клиентский код.
 *
 * Группа (group) в ключ НЕ входит намеренно: одна и та же характеристика у
 * разных товаров бывает разнесена по разным группам или не разнесена вовсе, и
 * с группой в ключе фасет раскололся бы ровно из-за того несовпадения, от
 * которого нормализация и защищает. Группа используется только для раскладки
 * фасетов по разделам панели.
 */

export interface SpecInput {
	name?: string | null;
	value?: string | null;
	unit?: string | null;
}

export interface NormalizedSpec {
	nameKey: string | null;
	valueKey: string | null;
	valueNum: number | null;
	unitKey: string | null;
}

export interface ResolvedUnit {
	/** id базовой единицы семейства («v», «w», «m»…) или slug неизвестной. */
	id: string;
	/** Множитель к базовой единице: кВт → 1000 (база — Вт). */
	factor: number;
	/** Каноническое написание для показа: «кВт». */
	symbol: string;
	/** Единица из словаря — её можно пересчитывать в другие того же семейства. */
	known: boolean;
}

/** Результат разбора одной строки — ключи плюс то, что нужно для подписей. */
export interface ParsedSpec extends NormalizedSpec {
	unit: ResolvedUnit | null;
}

const MAX_KEY_LENGTH = 64;
const MAX_VALUE_KEY_LENGTH = 96;

/* ─── Единицы измерения ────────────────────────────────────────────────── */

// [написания, id базы, множитель, каноническое написание]. Написания
// сравниваются после cleanUnit (без пробелов, точек и знаков умножения).
const UNIT_DEFS: [string[], string, number, string][] = [
	[["В", "V"], "v", 1, "В"],
	[["мВ", "mV"], "v", 1e-3, "мВ"],
	[["кВ", "kV"], "v", 1e3, "кВ"],
	[["Вт", "W"], "w", 1, "Вт"],
	[["мВт", "mW"], "w", 1e-3, "мВт"],
	[["кВт", "kW"], "w", 1e3, "кВт"],
	[["МВт", "MW"], "w", 1e6, "МВт"],
	[["А", "A"], "a", 1, "А"],
	[["мА", "mA"], "a", 1e-3, "мА"],
	[["кА", "kA"], "a", 1e3, "кА"],
	[["Гц", "Hz"], "hz", 1, "Гц"],
	[["кГц", "kHz"], "hz", 1e3, "кГц"],
	[["МГц", "MHz"], "hz", 1e6, "МГц"],
	[["ГГц", "GHz"], "hz", 1e9, "ГГц"],
	[["мкм", "µm", "μm"], "m", 1e-6, "мкм"],
	[["мм", "mm"], "m", 1e-3, "мм"],
	[["см", "cm"], "m", 1e-2, "см"],
	[["дм", "dm"], "m", 1e-1, "дм"],
	[["м", "m"], "m", 1, "м"],
	[["км", "km"], "m", 1e3, "км"],
	[["мг", "mg"], "kg", 1e-6, "мг"],
	[["г", "гр", "g"], "kg", 1e-3, "г"],
	[["кг", "kg"], "kg", 1, "кг"],
	[["т", "t"], "kg", 1e3, "т"],
	[["мс", "ms"], "s", 1e-3, "мс"],
	[["с", "сек", "s", "sec"], "s", 1, "с"],
	[["мин", "min"], "s", 60, "мин"],
	[["ч", "час", "h"], "s", 3600, "ч"],
	[["мАч", "mAh"], "ah", 1e-3, "мА·ч"],
	[["Ач", "Ah"], "ah", 1, "А·ч"],
	[["Втч", "Wh"], "wh", 1, "Вт·ч"],
	[["кВтч", "kWh"], "wh", 1e3, "кВт·ч"],
	[["мл", "ml"], "l", 1e-3, "мл"],
	[["л", "l"], "l", 1, "л"],
	[["Па", "Pa"], "pa", 1, "Па"],
	[["кПа", "kPa"], "pa", 1e3, "кПа"],
	[["МПа", "MPa"], "pa", 1e6, "МПа"],
	[["бар", "bar"], "pa", 1e5, "бар"],
	[["°C", "°С", "C", "С", "градС"], "c", 1, "°C"],
	[["%"], "pct", 1, "%"],
	[["шт"], "pcs", 1, "шт"],
];

const EXACT_UNITS = new Map<string, ResolvedUnit>();
const LOWER_UNITS = new Map<string, ResolvedUnit | null>();

for (const [spellings, id, factor, symbol] of UNIT_DEFS) {
	const unit: ResolvedUnit = { id, factor, symbol, known: true };
	for (const spelling of spellings) {
		const key = cleanUnit(spelling);
		EXACT_UNITS.set(key, unit);
		// Регистр значим только у приставок: «мВт» и «МВт» после toLowerCase
		// совпадают. Такое написание в регистронезависимую таблицу не попадает
		// (null) — лучше не распознать единицу, чем ошибиться в миллиард раз.
		const lower = key.toLowerCase();
		const existing = LOWER_UNITS.get(lower);
		if (existing === undefined) LOWER_UNITS.set(lower, unit);
		else if (
			existing &&
			(existing.id !== unit.id || existing.factor !== unit.factor)
		)
			LOWER_UNITS.set(lower, null);
	}
}
// «мгц» на практике всегда МГц — миллигерц в технике не встречаются, а
// написание строчными в карточках попадается.
LOWER_UNITS.set("мгц", EXACT_UNITS.get("МГц") ?? null);

function cleanUnit(raw: string): string {
	return raw
		.normalize("NFKC")
		.replace(/[\s.·⋅*]/g, "")
		.replace(/^град(ус(ов|а)?)?(ц(ельсия)?)?$/i, "°C")
		.replace(/^º/, "°");
}

/** Распознаёт единицу измерения. Пустая строка → null. */
export function resolveUnit(
	raw: string | null | undefined,
): ResolvedUnit | null {
	if (!raw) return null;
	const cleaned = cleanUnit(fixMixedScript(raw.trim()));
	if (!cleaned) return null;
	const known =
		EXACT_UNITS.get(cleaned) ?? LOWER_UNITS.get(cleaned.toLowerCase());
	if (known) return known;
	const id = slugify(cleaned);
	return id ? { id, factor: 1, symbol: raw.trim(), known: false } : null;
}

/* ─── Текст ────────────────────────────────────────────────────────────── */

// Кириллические буквы, которые пишутся так же, как латинские. В технических
// обозначениях («IP67», «IEC C13») их набирают вперемешку с латиницей, и
// «IР67» с русской «Р» иначе стал бы отдельным значением фасета.
const HOMOGLYPHS: Record<string, string> = {
	А: "A",
	В: "B",
	Е: "E",
	К: "K",
	М: "M",
	Н: "H",
	О: "O",
	Р: "P",
	С: "C",
	Т: "T",
	Х: "X",
	а: "a",
	е: "e",
	о: "o",
	р: "p",
	с: "c",
	у: "y",
	х: "x",
};

/** В словах, где уже есть латиница, кириллические двойники → латиница. */
function fixMixedScript(text: string): string {
	return text.replace(/[\p{L}\p{N}]+/gu, (word) =>
		/[A-Za-z]/.test(word) && /[А-Яа-яЁё]/.test(word)
			? word.replace(/[АВЕКМНОРСТХаеорсух]/g, (ch) => HOMOGLYPHS[ch] ?? ch)
			: word,
	);
}

/** Общая чистка: регистр, ё, тире, кавычки, пробелы, хвостовая пунктуация. */
export function cleanText(raw: string | null | undefined): string {
	if (!raw) return "";
	return fixMixedScript(raw.normalize("NFKC"))
		.toLowerCase()
		.replace(/ё/g, "е")
		.replace(/[‐‑‒–—―−]/g, "-")
		.replace(/[«»„“”"'`’]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\s.,;:]+$/, "");
}

const TRANSLIT: Record<string, string> = {
	а: "a",
	б: "b",
	в: "v",
	г: "g",
	д: "d",
	е: "e",
	ж: "zh",
	з: "z",
	и: "i",
	й: "y",
	к: "k",
	л: "l",
	м: "m",
	н: "n",
	о: "o",
	п: "p",
	р: "r",
	с: "s",
	т: "t",
	у: "u",
	ф: "f",
	х: "kh",
	ц: "ts",
	ч: "ch",
	ш: "sh",
	щ: "shch",
	ъ: "",
	ы: "y",
	ь: "",
	э: "e",
	ю: "yu",
	я: "ya",
};

/** Транслит в [a-z0-9-]. Используется для ключей и параметров URL. */
export function slugify(text: string, maxLength = MAX_KEY_LENGTH): string {
	const latin = cleanText(text)
		.replace(/[а-я]/g, (ch) => TRANSLIT[ch] ?? "")
		// Знак минуса перед числом значим: «−40…+55» и «40…55» — разные
		// диапазоны, а дефис в slug потерял бы его.
		.replace(/(^|[^a-z0-9])-(?=\d)/g, "$1 m")
		.replace(/%/g, " pct ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return latin.slice(0, maxLength).replace(/-+$/, "");
}

/* ─── Числа ────────────────────────────────────────────────────────────── */

const NUMBER_WITH_TAIL = /^([+-]?\d+(?:\.\d+)?)\s*(.*)$/;

function prepareNumeric(text: string): string {
	return (
		text
			.normalize("NFKC")
			.replace(/[‐‑‒–—―−]/g, "-")
			// Разряды через пробел («1 200») — одно число, а не два.
			.replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, "$1")
			.replace(/(\d),(\d)/g, "$1.$2")
			.trim()
	);
}

/** Число без хвостов плавающей точки: 0.30000000000000004 → 0.3. */
export function roundNumber(value: number): number {
	return Number(value.toPrecision(12));
}

/* ─── Разбор строки характеристики ────────────────────────────────────── */

// «Напряжение питания, В» / «Масса (кг)» — единица в названии.
const NAME_WITH_UNIT = /^(.+?)\s*(?:,\s*([^,()]+)|\(([^()]+)\))$/;

function splitNameUnit(name: string): { core: string; unit: string | null } {
	const match = NAME_WITH_UNIT.exec(name.trim());
	if (match) {
		const tail = (match[2] ?? match[3] ?? "").trim();
		if (resolveUnit(tail)?.known) return { core: match[1], unit: tail };
	}
	return { core: name, unit: null };
}

/** Название без единицы в хвосте: «Масса, кг» → «Масса». */
export function specDisplayName(name: string): string {
	return splitNameUnit(name).core.trim();
}

/** Ключ характеристики по её названию. Пусто → null. */
export function specNameKey(name: string | null | undefined): string | null {
	if (!name) return null;
	return slugify(splitNameUnit(name).core) || null;
}

/**
 * Разбирает строку характеристики. Число распознаётся, только если значение
 * — ровно число с необязательной известной единицей: «до 98», «−40…+55»,
 * «900 / 1200» остаются текстом, чтобы не выдумывать значения, которых в
 * карточке нет.
 */
export function parseSpec(input: SpecInput): ParsedSpec {
	const nameParts = input.name ? splitNameUnit(input.name) : null;
	const nameKey = nameParts ? slugify(nameParts.core) || null : null;
	const explicitUnit = input.unit?.trim() || nameParts?.unit || "";
	const rawValue = input.value?.trim() ?? "";

	const empty: ParsedSpec = {
		nameKey,
		valueKey: null,
		valueNum: null,
		unitKey: null,
		unit: null,
	};
	if (!rawValue || !/[\p{L}\p{N}]/u.test(rawValue)) return empty;

	const numeric = NUMBER_WITH_TAIL.exec(prepareNumeric(rawValue));
	if (numeric) {
		const tail = numeric[2].trim();
		const tailUnit = tail ? resolveUnit(tail) : null;
		if (!tail || tailUnit?.known) {
			const unit = tailUnit ?? resolveUnit(explicitUnit);
			const valueNum = roundNumber(Number(numeric[1]) * (unit?.factor ?? 1));
			if (Number.isFinite(valueNum)) {
				return {
					nameKey,
					valueKey: `${valueNum}${unit?.id ?? ""}`,
					valueNum,
					unitKey: unit?.id ?? null,
					unit,
				};
			}
		}
	}

	const unit = resolveUnit(explicitUnit);
	const textKey = slugify(rawValue, MAX_VALUE_KEY_LENGTH);
	if (!textKey) return empty;
	return {
		nameKey,
		valueKey: unit ? `${textKey}-${unit.id}` : textKey,
		valueNum: null,
		unitKey: unit?.id ?? null,
		unit,
	};
}

/** Ключи для записи в строку характеристики. */
export function normalizeSpec(input: SpecInput): NormalizedSpec {
	const { nameKey, valueKey, valueNum, unitKey } = parseSpec(input);
	return { nameKey, valueKey, valueNum, unitKey };
}

/** Ключ производителя: «НПО «Полёт»» и «нпо полет» — один производитель. */
export function manufacturerKey(raw: string | null | undefined): string | null {
	return raw ? slugify(raw) || null : null;
}
