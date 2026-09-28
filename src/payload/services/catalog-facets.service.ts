import { sql } from "@payloadcms/db-postgres";
import { unstable_cache } from "next/cache";
import type { CatalogFacet } from "../../../payload-types";
import { env } from "../../env";
import {
	parseSpec,
	type ResolvedUnit,
	resolveUnit,
	roundNumber,
	specDisplayName,
	specNameKey,
} from "../../modules/productCatalog/lib/specNormalization";
import type {
	CatalogFacets,
	FacetSelection,
	SortField,
	SortOrder,
	SpecFacet,
	SpecSelection,
} from "../../modules/productCatalog/types/filters";
import { getPayloadInstance } from "./getPayload";

/**
 * Фасетная фильтрация каталога.
 *
 * ─── Модель ─────────────────────────────────────────────────────────────────
 * Набор фасетов строится по разделу — из того, что реально есть у его видимых
 * товаров, а не из глобального списка:
 *
 *   • характеристики — по нормализованным ключам строк specifications
 *     (nameKey/valueKey/valueNum/unitKey, см. specNormalization.ts), поверх
 *     которых раздел может иметь ручной словарь (коллекция catalog-facets:
 *     склейка написаний, вид фильтра, скрытие, порядок);
 *   • производитель — по brand.manufacturerKey;
 *   • наличие скидки — по тем же правилам, что бейдж скидки на карточке
 *     (mapDiscountPercentage): включена и больше нуля.
 *
 * ─── Счётчики ───────────────────────────────────────────────────────────────
 * Классическая «дизъюнктивная» модель: между фасетами — И, внутри фасета — ИЛИ,
 * и число у значения фасета считается со ВСЕМИ фильтрами, КРОМЕ фильтра этого
 * же фасета. Так число у соседнего значения отвечает на вопрос «сколько
 * товаров станет, если отметить и его», а уже выбранные значения не обнуляют
 * соседей. Все счётчики — один SQL-запрос: условие каждого фасета вычисляется
 * один раз на товар (флаг fN в CTE), а «все, кроме своего» собирается из
 * флагов.
 *
 * ─── Кэш ───────────────────────────────────────────────────────────────────
 * В Data Cache попадает только то, чьё число вариантов ограничено:
 *   • определения фасетов — одна запись на раздел;
 *   • счётчики и страницы БЕЗ фасетов и без цены — раздел × наличие ×
 *     сортировка × страница (страница — до MAX_CACHED_PAGE).
 * Любая комбинация фасетов или цены считается запросом к базе без кэша:
 * иначе каждый новый адрес заводил бы вечную (revalidate: false) запись, и
 * перебор параметров раздувал бы кэш без предела. Запросы при этом дешёвые —
 * ограничены одним разделом и идут по индексам.
 */

/* ─── Типы ─────────────────────────────────────────────────────────────── */

export interface FacetValueDefinition {
	key: string;
	label: string;
	productCount: number;
}

export interface SpecFacetDefinition {
	key: string;
	label: string;
	group: string | null;
	kind: "list" | "range";
	/** Ключи строк характеристик, склеенные в этот фасет (словарь). */
	nameKeys: string[];
	productCount: number;
	/** Список: значения в порядке показа. */
	values: FacetValueDefinition[];
	/** Диапазон: база единицы, единица показа и границы в ней. */
	unitId: string | null;
	unitSymbol: string | null;
	unitFactor: number;
	min: number;
	max: number;
}

export interface CategoryFacetDefinitions {
	total: number;
	specs: SpecFacetDefinition[];
	manufacturers: FacetValueDefinition[];
	discountCount: number;
}

export type CatalogProductStatus =
	| "available"
	| "preorder"
	| "out_of_stock"
	| "discontinued";

export interface CatalogQueryContext {
	categoryId: number;
	status?: CatalogProductStatus;
	priceFrom?: number;
	priceTo?: number;
	/** Уже сверенный с разделом выбор — см. sanitizeFacetSelection. */
	selection: FacetSelection;
}

type SqlChunk = ReturnType<typeof sql>;
type DrizzleRows = { rows?: Record<string, unknown>[] };

/* ─── Пороги автоматических фасетов ───────────────────────────────────── */

/** Характеристика должна встречаться хотя бы у стольких товаров раздела. */
const MIN_PRODUCTS_PER_FACET = 2;
/** Больше значений в списке — это уже не фильтр, а перечень. */
const MAX_LIST_VALUES = 50;
/** Значения длиннее — описания, а не параметры («Тип антенны: …»). */
const MAX_VALUE_LABEL_LENGTH = 60;
/** Числовая характеристика с таким числом разных значений — диапазон. */
const MIN_RANGE_DISTINCT_VALUES = 6;
/** Доля числовых строк, при которой характеристика считается числовой. */
const NUMERIC_SHARE = 0.8;
const MAX_SPEC_FACETS = 30;
const AUTO_ORDER = 1000;

export const MAX_CACHED_PAGE = 20;

/* ─── Общие куски SQL ─────────────────────────────────────────────────── */

// Та же логика, что mapDiscountPercentage (productCard/lib/adapter.ts):
// скидка включена, значение больше нуля, фиксированная — только при ненулевой
// цене. Сроки validFrom/validUntil карточка не учитывает — и фильтр тоже,
// иначе отмеченное «со скидкой» расходилось бы с бейджами на карточках.
const HAS_DISCOUNT = sql`(
	p.pricing_discount_is_active IS TRUE
	AND COALESCE(p.pricing_discount_value, 0) > 0
	AND (p.pricing_discount_type IS DISTINCT FROM 'fixed'
		OR COALESCE(p.pricing_price_for_individual, 0) > 0)
)`;

// Условия выдачи раздела — те же, что у buildProductWhere с isVisible: true
// (products.service.ts): опубликован, не скрыт, в разделе.
function visibleInCategory(categoryId: number): SqlChunk {
	return sql`p._status = 'published'
		AND p.inventory_is_visible = true
		AND p.category_id = ${categoryId}`;
}

function list(values: (string | number)[]): SqlChunk {
	return sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	);
}

async function execute(query: SqlChunk): Promise<Record<string, unknown>[]> {
	const payload = await getPayloadInstance();
	const result = (await payload.db.drizzle.execute(query)) as DrizzleRows;
	return result.rows ?? [];
}

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function mostFrequent<T>(items: T[]): T | undefined {
	const counts = new Map<T, number>();
	let best: T | undefined;
	let bestCount = 0;
	for (const item of items) {
		const count = (counts.get(item) ?? 0) + 1;
		counts.set(item, count);
		if (count > bestCount) {
			best = item;
			bestCount = count;
		}
	}
	return best;
}

const collator = new Intl.Collator("ru", {
	numeric: true,
	sensitivity: "base",
});

/* ─── Определения фасетов раздела ─────────────────────────────────────── */

interface SpecRow {
	productId: number;
	name: string;
	value: string;
	unit: string | null;
	group: string | null;
	nameKey: string;
	valueKey: string;
	valueNum: number | null;
	unitKey: string | null;
}

interface DictionaryEntry {
	key: string;
	label: string;
	display: NonNullable<CatalogFacet["display"]>;
	unit: string | null;
	group: string | null;
	order: number;
}

async function fetchDictionary(
	categoryId: number,
): Promise<Map<string, DictionaryEntry>> {
	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "catalog-facets",
		where: { category: { equals: categoryId } },
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});

	// nameKey любого написания → запись словаря. Ключ фасета — ключ его
	// основного названия.
	const byNameKey = new Map<string, DictionaryEntry>();
	for (const doc of docs) {
		const key = specNameKey(doc.label);
		if (!key) continue;
		const entry: DictionaryEntry = {
			key,
			label: doc.label.trim(),
			display: doc.display ?? "auto",
			unit: doc.unit?.trim() || null,
			group: doc.group?.trim() || null,
			order: doc.order ?? 0,
		};
		for (const name of [doc.label, ...(doc.aliases ?? []).map((a) => a.name)]) {
			const nameKey = specNameKey(name);
			if (nameKey && !byNameKey.has(nameKey)) byNameKey.set(nameKey, entry);
		}
	}
	return byNameKey;
}

function formatRawValue(row: SpecRow): string {
	const unit = row.unit?.trim();
	return unit ? `${row.value.trim()} ${unit}` : row.value.trim();
}

function buildSpecFacet(
	key: string,
	rows: SpecRow[],
	entry: DictionaryEntry | undefined,
	categoryTotal: number,
): SpecFacetDefinition | null {
	if (entry?.display === "hidden") return null;

	const productIds = new Set(rows.map((row) => row.productId));
	const forced = entry?.display === "list" || entry?.display === "range";
	if (!forced && productIds.size < MIN_PRODUCTS_PER_FACET) return null;

	const label =
		entry?.label ??
		specDisplayName(mostFrequent(rows.map((row) => row.name.trim())) ?? key);
	const group =
		entry?.group ??
		mostFrequent(
			rows.map((row) => row.group?.trim()).filter((g): g is string => !!g),
		) ??
		null;

	const base = {
		key,
		label,
		group,
		nameKeys: [...new Set(rows.map((row) => row.nameKey))],
		productCount: productIds.size,
		values: [] as FacetValueDefinition[],
		unitId: null as string | null,
		unitSymbol: null as string | null,
		unitFactor: 1,
		min: 0,
		max: 0,
	};

	// Числовая часть: берётся преобладающее семейство единиц — «20 Вт» и
	// «20 дБм» в одном диапазоне смешивать нельзя.
	const numericUnit = mostFrequent(
		rows.filter((row) => row.valueNum !== null).map((row) => row.unitKey ?? ""),
	);
	const numericRows = rows.filter(
		(row) => row.valueNum !== null && (row.unitKey ?? "") === numericUnit,
	);
	const distinctNumbers = new Set(numericRows.map((row) => row.valueNum));
	const wantsRange =
		entry?.display === "range" ||
		(entry?.display !== "list" &&
			numericRows.length >= rows.length * NUMERIC_SHARE &&
			distinctNumbers.size >= MIN_RANGE_DISTINCT_VALUES);

	if (wantsRange && distinctNumbers.size >= 2) {
		// Единица показа: из словаря (если того же семейства), иначе самая
		// частая в карточках раздела.
		const configured = resolveUnit(entry?.unit);
		const rowUnits = new Map<string, ResolvedUnit>();
		for (const row of numericRows) {
			const unit = parseSpec(row).unit;
			if (unit) rowUnits.set(`${unit.factor}|${unit.symbol}`, unit);
		}
		const display =
			configured && configured.id === (numericUnit || null)
				? configured
				: rowUnits.get(
						mostFrequent(
							numericRows.map((row) => {
								const unit = parseSpec(row).unit;
								return unit ? `${unit.factor}|${unit.symbol}` : "";
							}),
						) ?? "",
					);
		const factor = display?.factor || 1;
		const nums = numericRows.map((row) => (row.valueNum ?? 0) / factor);
		return {
			...base,
			kind: "range",
			unitId: numericUnit || null,
			unitSymbol: display?.symbol || null,
			unitFactor: factor,
			min: roundNumber(Math.min(...nums)),
			max: roundNumber(Math.max(...nums)),
		};
	}

	const byValue = new Map<string, SpecRow[]>();
	for (const row of rows) {
		const bucket = byValue.get(row.valueKey) ?? [];
		bucket.push(row);
		byValue.set(row.valueKey, bucket);
	}

	const values = [...byValue].map(([valueKey, valueRows]) => ({
		key: valueKey,
		label: mostFrequent(valueRows.map(formatRawValue)) ?? valueKey,
		productCount: new Set(valueRows.map((row) => row.productId)).size,
		num: valueRows[0].valueNum,
	}));
	values.sort((a, b) =>
		a.num !== null && b.num !== null
			? a.num - b.num
			: collator.compare(a.label, b.label),
	);

	if (!forced) {
		// Фильтр должен что-то отсеивать: одно значение у всех товаров
		// раздела — не выбор.
		const narrows = values.length >= 2 || productIds.size < categoryTotal;
		const descriptive =
			values.filter((v) => v.label.length > MAX_VALUE_LABEL_LENGTH).length * 2 >
			values.length;
		if (!narrows || descriptive || values.length > MAX_LIST_VALUES) return null;
	}

	return {
		...base,
		kind: "list",
		values: values.map(
			({ key: valueKey, label: valueLabel, productCount }) => ({
				key: valueKey,
				label: valueLabel,
				productCount,
			}),
		),
	};
}

async function fetchCategoryFacetDefinitions(
	categoryId: number,
): Promise<CategoryFacetDefinitions> {
	const [productRows, specRows, dictionary] = await Promise.all([
		execute(sql`
			SELECT
				p.id,
				p.brand_manufacturer AS manufacturer,
				p.brand_manufacturer_key AS manufacturer_key,
				${HAS_DISCOUNT} AS has_discount
			FROM products p
			WHERE ${visibleInCategory(categoryId)}
		`),
		execute(sql`
			SELECT s._parent_id AS product_id, s.name, s.value, s.unit, s."group",
				s.name_key, s.value_key, s.value_num, s.unit_key
			FROM products_specifications s
			JOIN products p ON p.id = s._parent_id
			WHERE ${visibleInCategory(categoryId)}
				AND s.is_visible IS NOT FALSE
				AND s.name_key IS NOT NULL
				AND s.value_key IS NOT NULL
		`),
		fetchDictionary(categoryId),
	]);

	const total = productRows.length;

	// Производители
	const manufacturers = new Map<string, { labels: string[]; count: number }>();
	let discountCount = 0;
	for (const row of productRows) {
		if (row.has_discount === true) discountCount++;
		const key = row.manufacturer_key as string | null;
		if (!key) continue;
		const bucket = manufacturers.get(key) ?? { labels: [], count: 0 };
		bucket.labels.push(String(row.manufacturer ?? "").trim());
		bucket.count++;
		manufacturers.set(key, bucket);
	}

	// Характеристики — по ключу фасета (с учётом словаря)
	const byFacet = new Map<string, SpecRow[]>();
	for (const raw of specRows) {
		const row: SpecRow = {
			productId: toNumber(raw.product_id),
			name: String(raw.name ?? ""),
			value: String(raw.value ?? ""),
			unit: (raw.unit as string | null) ?? null,
			group: (raw.group as string | null) ?? null,
			nameKey: String(raw.name_key),
			valueKey: String(raw.value_key),
			valueNum: raw.value_num === null ? null : toNumber(raw.value_num),
			unitKey: (raw.unit_key as string | null) ?? null,
		};
		const facetKey = dictionary.get(row.nameKey)?.key ?? row.nameKey;
		const bucket = byFacet.get(facetKey) ?? [];
		bucket.push(row);
		byFacet.set(facetKey, bucket);
	}

	const orderOf = (key: string) =>
		[...dictionary.values()].find((entry) => entry.key === key)?.order ??
		AUTO_ORDER;
	const specs = [...byFacet]
		.map(([key, rows]) =>
			buildSpecFacet(
				key,
				rows,
				[...dictionary.values()].find((entry) => entry.key === key),
				total,
			),
		)
		.filter((facet): facet is SpecFacetDefinition => facet !== null)
		.sort(
			(a, b) =>
				orderOf(a.key) - orderOf(b.key) ||
				b.productCount - a.productCount ||
				collator.compare(a.label, b.label),
		)
		.slice(0, MAX_SPEC_FACETS);

	return {
		total,
		specs,
		manufacturers: [...manufacturers]
			.map(([key, { labels, count }]) => ({
				key,
				label: mostFrequent(labels) || key,
				productCount: count,
			}))
			.sort((a, b) => collator.compare(a.label, b.label)),
		discountCount,
	};
}

export const getCategoryFacetDefinitions = (categoryId: number) => {
	const fetchFn = () => fetchCategoryFacetDefinitions(categoryId);
	if (env.NODE_ENV === "development") return fetchFn();
	return unstable_cache(fetchFn, [`catalog-facet-defs-${categoryId}`], {
		tags: ["products", "catalog-facets"],
		revalidate: false,
	})();
};

/* ─── Сверка выбора с разделом ────────────────────────────────────────── */

/**
 * Оставляет в выборе только то, что есть в фасетах раздела. Всё прочее —
 * опечатки, устаревшие ссылки, перебор параметров — отбрасывается молча:
 * до SQL и до ключей кэша доходят только известные ключи и значения.
 */
export function sanitizeFacetSelection(
	selection: FacetSelection,
	defs: CategoryFacetDefinitions,
): FacetSelection {
	const brandKeys = new Set(defs.manufacturers.map((m) => m.key));
	const specs: Record<string, SpecSelection> = {};

	for (const facet of defs.specs) {
		const chosen = selection.specs[facet.key];
		if (!chosen) continue;
		if (facet.kind === "list") {
			const allowed = new Set(facet.values.map((v) => v.key));
			const values = (chosen.values ?? []).filter((v) => allowed.has(v));
			if (values.length > 0) specs[facet.key] = { values };
		} else {
			// Граница за пределами значений раздела ничего не отсекает —
			// снимается, чтобы «весь диапазон» не отличался адресом от
			// «без фильтра».
			const min =
				chosen.min !== undefined && chosen.min > facet.min
					? roundNumber(chosen.min)
					: undefined;
			const max =
				chosen.max !== undefined && chosen.max < facet.max
					? roundNumber(chosen.max)
					: undefined;
			if (min !== undefined || max !== undefined)
				specs[facet.key] = { min, max };
		}
	}

	return {
		brands: selection.brands.filter((key) => brandKeys.has(key)),
		discount: selection.discount && defs.discountCount > 0,
		specs,
	};
}

export function isSimpleContext(ctx: CatalogQueryContext): boolean {
	return (
		ctx.priceFrom === undefined &&
		ctx.priceTo === undefined &&
		ctx.selection.brands.length === 0 &&
		!ctx.selection.discount &&
		Object.keys(ctx.selection.specs).length === 0
	);
}

/* ─── Построение запроса ──────────────────────────────────────────────── */

interface Flag {
	column: SqlChunk;
	kind: "spec" | "brand" | "discount";
	facetKey?: string;
	/** brand/discount — условие на строку base (алиас b); spec — на строку
	 *  характеристики (алиас s), включая её ключ. */
	condition: SqlChunk;
	/** spec: ключи строк, которые нужно прочитать для этого условия. */
	nameKeys?: string[];
}

function buildFlags(
	ctx: CatalogQueryContext,
	defs: CategoryFacetDefinitions,
): Flag[] {
	const flags: Omit<Flag, "column">[] = [];

	if (ctx.selection.brands.length > 0) {
		flags.push({
			kind: "brand",
			condition: sql`b.brand_key IN (${list(ctx.selection.brands)})`,
		});
	}
	if (ctx.selection.discount) {
		flags.push({ kind: "discount", condition: sql`b.has_discount` });
	}

	for (const facet of defs.specs) {
		const chosen = ctx.selection.specs[facet.key];
		if (!chosen) continue;
		const rowMatch =
			facet.kind === "list"
				? sql`s.value_key IN (${list(chosen.values ?? [])})`
				: sql.join(
						[
							facet.unitId === null
								? sql`s.unit_key IS NULL`
								: sql`s.unit_key = ${facet.unitId}`,
							chosen.min !== undefined
								? sql`s.value_num >= ${roundNumber(chosen.min * facet.unitFactor)}`
								: undefined,
							chosen.max !== undefined
								? sql`s.value_num <= ${roundNumber(chosen.max * facet.unitFactor)}`
								: undefined,
						].filter((part): part is SqlChunk => part !== undefined),
						sql` AND `,
					);
		flags.push({
			kind: "spec",
			facetKey: facet.key,
			nameKeys: facet.nameKeys,
			condition: sql`(s.name_key IN (${list(facet.nameKeys)}) AND ${rowMatch})`,
		});
	}

	return flags.map((flag, index) => ({
		...flag,
		column: sql.raw(`f${index}`),
	}));
}

/** И всех флагов, кроме исключённого. Пусто — TRUE. */
function allFlags(flags: Flag[], except?: Flag): SqlChunk {
	const parts = flags
		.filter((flag) => flag !== except)
		.map((flag) => sql`f.${flag.column}`);
	return parts.length > 0 ? sql.join(parts, sql` AND `) : sql`TRUE`;
}

function buildCtes(
	ctx: CatalogQueryContext,
	flags: Flag[],
	withSortColumns: boolean,
): SqlChunk {
	const conditions: SqlChunk[] = [visibleInCategory(ctx.categoryId)];
	if (ctx.status) conditions.push(sql`p.inventory_status = ${ctx.status}`);
	if (ctx.priceFrom !== undefined)
		conditions.push(sql`p.pricing_price_for_individual >= ${ctx.priceFrom}`);
	if (ctx.priceTo !== undefined)
		conditions.push(sql`p.pricing_price_for_individual <= ${ctx.priceTo}`);

	// Колонки сортировки нужны только выдаче; счётчикам — нет, и лишний JOIN
	// названий им ни к чему.
	const sortColumns = withSortColumns
		? sql`,
			p.created_at,
			p.pricing_price_for_individual AS price,
			pl.title,
			p.analytics_views_count AS views,
			p.analytics_purchases_count AS purchases,
			p.analytics_rating_average AS rating,
			p.analytics_reviews_count AS reviews`
		: sql``;
	const titleJoin = withSortColumns
		? sql`LEFT JOIN products_locales pl ON pl._parent_id = p.id AND pl._locale = 'ru'`
		: sql``;

	// Условия по характеристикам считаются ОДНИМ проходом по строкам
	// характеристик товаров раздела (bool_or по товару), а не отдельным
	// EXISTS на каждый фасет: EXISTS планировщик превращал в хешированный
	// подзапрос по всей таблице характеристик — полный её просмотр на каждый
	// выбранный фасет. Здесь читаются только строки товаров раздела с нужными
	// ключами, по индексу products_specifications_facet_idx.
	const specFlags = flags.filter((flag) => flag.kind === "spec");
	const specKeys = [
		...new Set(specFlags.flatMap((flag) => flag.nameKeys ?? [])),
	];
	const specCte =
		specFlags.length > 0
			? sql`,
		spec_flags AS MATERIALIZED (
			SELECT s._parent_id AS id, ${sql.join(
				specFlags.map(
					(flag) => sql`bool_or(${flag.condition}) AS ${flag.column}`,
				),
				sql`, `,
			)}
			FROM base b
			JOIN products_specifications s ON s._parent_id = b.id
			WHERE s.is_visible IS NOT FALSE AND s.name_key IN (${list(specKeys)})
			GROUP BY s._parent_id
		)`
			: sql``;
	const flagColumns =
		flags.length > 0
			? sql`, ${sql.join(
					flags.map((flag) =>
						flag.kind === "spec"
							? sql`COALESCE(sf.${flag.column}, false) AS ${flag.column}`
							: sql`${flag.condition} AS ${flag.column}`,
					),
					sql`, `,
				)}`
			: sql``;
	const specJoin =
		specFlags.length > 0 ? sql`LEFT JOIN spec_flags sf ON sf.id = b.id` : sql``;

	return sql`
		base AS MATERIALIZED (
			SELECT
				p.id,
				p.brand_manufacturer_key AS brand_key,
				${HAS_DISCOUNT} AS has_discount
				${sortColumns}
			FROM products p
			${titleJoin}
			WHERE ${sql.join(conditions, sql` AND `)}
		)${specCte},
		flagged AS MATERIALIZED (
			SELECT b.* ${flagColumns} FROM base b ${specJoin}
		)`;
}

/* ─── Счётчики фасетов ────────────────────────────────────────────────── */

interface FacetCounts {
	total: number;
	spec: Map<string, Map<string, number>>;
	brand: Map<string, number>;
	discount: number;
}

async function fetchFacetCounts(
	ctx: CatalogQueryContext,
	defs: CategoryFacetDefinitions,
): Promise<FacetCounts> {
	const flags = buildFlags(ctx, defs);
	const brandFlag = flags.find((flag) => flag.kind === "brand");
	const discountFlag = flags.find((flag) => flag.kind === "discount");

	// nameKey строки → ключ фасета и флаг этого фасета: строки фасета
	// считаются без его собственного условия.
	const listFacets = defs.specs.filter((facet) => facet.kind === "list");
	const mapping = listFacets.flatMap((facet) => {
		const own = flags.findIndex((flag) => flag.facetKey === facet.key);
		return facet.nameKeys.map(
			(nameKey) => sql`(${nameKey}::text, ${facet.key}::text, ${own}::int)`,
		);
	});
	const specSelfExcluded =
		flags.length > 0
			? sql.join(
					flags.map(
						(flag, index) => sql`(f.${flag.column} OR m.own = ${index})`,
					),
					sql` AND `,
				)
			: sql`TRUE`;

	const specCounts =
		mapping.length > 0
			? sql`
				SELECT 'spec' AS kind, m.facet, s.value_key AS value,
					COUNT(DISTINCT s._parent_id)::int AS n
				FROM flagged f
				JOIN products_specifications s ON s._parent_id = f.id
				JOIN (VALUES ${sql.join(mapping, sql`, `)}) AS m(name_key, facet, own)
					ON m.name_key = s.name_key
				WHERE s.is_visible IS NOT FALSE AND ${specSelfExcluded}
				GROUP BY m.facet, s.value_key
				UNION ALL`
			: sql``;

	const rows = await execute(sql`
		WITH ${buildCtes(ctx, flags, false)}
		${specCounts}
		SELECT 'brand' AS kind, f.brand_key AS facet, NULL AS value, COUNT(*)::int AS n
		FROM flagged f
		WHERE f.brand_key IS NOT NULL AND ${allFlags(flags, brandFlag)}
		GROUP BY f.brand_key
		UNION ALL
		SELECT 'discount', NULL, NULL, COUNT(*)::int
		FROM flagged f
		WHERE f.has_discount AND ${allFlags(flags, discountFlag)}
		UNION ALL
		SELECT 'total', NULL, NULL, COUNT(*)::int
		FROM flagged f
		WHERE ${allFlags(flags)}
	`);

	const counts: FacetCounts = {
		total: 0,
		spec: new Map(),
		brand: new Map(),
		discount: 0,
	};
	for (const row of rows) {
		const n = toNumber(row.n);
		if (row.kind === "total") counts.total = n;
		else if (row.kind === "discount") counts.discount = n;
		else if (row.kind === "brand") counts.brand.set(String(row.facet), n);
		else {
			const facet = String(row.facet);
			const bucket = counts.spec.get(facet) ?? new Map<string, number>();
			bucket.set(String(row.value), n);
			counts.spec.set(facet, bucket);
		}
	}
	return counts;
}

function assembleFacets(
	ctx: CatalogQueryContext,
	defs: CategoryFacetDefinitions,
	counts: FacetCounts,
): CatalogFacets {
	const { selection } = ctx;

	const specs: SpecFacet[] = defs.specs.map((facet) => {
		const chosen = selection.specs[facet.key];
		if (facet.kind === "range") {
			return {
				kind: "range",
				key: facet.key,
				label: facet.label,
				group: facet.group,
				unit: facet.unitSymbol,
				min: facet.min,
				max: facet.max,
				selectedMin: chosen?.min,
				selectedMax: chosen?.max,
			};
		}
		const valueCounts = counts.spec.get(facet.key);
		const selected = new Set(chosen?.values ?? []);
		return {
			kind: "list",
			key: facet.key,
			label: facet.label,
			group: facet.group,
			values: facet.values.map((value) => ({
				value: value.key,
				label: value.label,
				count: valueCounts?.get(value.key) ?? 0,
				selected: selected.has(value.key),
			})),
		};
	});

	// Фасет из одного производителя или скидка у всех товаров раздела ничего
	// не отсеивают — такие не показываются (но выбранные — всегда, чтобы их
	// можно было снять).
	const brands = new Set(selection.brands);
	const manufacturers =
		defs.manufacturers.length >= 2 ||
		(defs.manufacturers[0]?.productCount ?? defs.total) < defs.total ||
		brands.size > 0
			? defs.manufacturers.map((m) => ({
					value: m.key,
					label: m.label,
					count: counts.brand.get(m.key) ?? 0,
					selected: brands.has(m.key),
				}))
			: [];

	const discount =
		(defs.discountCount > 0 && defs.discountCount < defs.total) ||
		selection.discount
			? { count: counts.discount, selected: selection.discount }
			: null;

	return { manufacturers, discount, specs };
}

/**
 * Фасеты раздела со счётчиками под текущий выбор. Кэшируются только для
 * выдачи без фасетов и цены (см. шапку модуля).
 */
export async function getCatalogFacets(
	ctx: CatalogQueryContext,
	defs: CategoryFacetDefinitions,
): Promise<CatalogFacets> {
	const fetchFn = async () =>
		assembleFacets(ctx, defs, await fetchFacetCounts(ctx, defs));
	if (env.NODE_ENV === "development" || !isSimpleContext(ctx)) return fetchFn();
	return unstable_cache(
		fetchFn,
		[`catalog-facet-counts-${ctx.categoryId}-${ctx.status ?? "any"}`],
		{ tags: ["products", "catalog-facets"], revalidate: false },
	)();
}

/* ─── Страница выдачи ─────────────────────────────────────────────────── */

const SORT_COLUMNS: Record<SortField, string> = {
	createdAt: "f.created_at",
	price: "f.price",
	title: "f.title",
	viewsCount: "f.views",
	purchasesCount: "f.purchases",
	rating: "f.rating",
};

function buildOrderBy(field: SortField, order: SortOrder): SqlChunk {
	const direction = order === "asc" ? "ASC" : "DESC";
	const column = SORT_COLUMNS[field] ?? SORT_COLUMNS.createdAt;
	// NULLS LAST: товар без оценки или без счётчика не должен всплывать над
	// всеми при сортировке по убыванию. id — стабильный порядок одинаковых
	// значений, иначе при подгрузке страниц товары дублировались бы и терялись.
	const tieBreak =
		field === "rating" ? `, f.reviews ${direction} NULLS LAST` : "";
	return sql.raw(`${column} ${direction} NULLS LAST${tieBreak}, f.id DESC`);
}

export interface CatalogIdsPage {
	ids: number[];
	total: number;
}

/**
 * id товаров страницы в нужном порядке и общее число под фильтры. Сами
 * документы подтягивает вызывающая сторона (products.service) — выборка
 * здесь не зависит от формы документа.
 */
export async function queryCatalogProductIds(
	ctx: CatalogQueryContext,
	defs: CategoryFacetDefinitions,
	sort: { field: SortField; order: SortOrder },
	page: number,
	limit: number,
): Promise<CatalogIdsPage> {
	const flags = buildFlags(ctx, defs);
	const offset = (page - 1) * limit;

	const rows = await execute(sql`
		WITH ${buildCtes(ctx, flags, true)}
		SELECT f.id, COUNT(*) OVER()::int AS total
		FROM flagged f
		WHERE ${allFlags(flags)}
		ORDER BY ${buildOrderBy(sort.field, sort.order)}
		LIMIT ${limit} OFFSET ${offset}
	`);

	if (rows.length > 0) {
		return {
			ids: rows.map((row) => toNumber(row.id)),
			total: toNumber(rows[0].total),
		};
	}
	// Страница за концом выдачи: строк нет, а с ними и оконного итога.
	if (offset === 0) return { ids: [], total: 0 };
	const [row] = await execute(sql`
		WITH ${buildCtes(ctx, flags, false)}
		SELECT COUNT(*)::int AS total FROM flagged f WHERE ${allFlags(flags)}
	`);
	return { ids: [], total: toNumber(row?.total) };
}
