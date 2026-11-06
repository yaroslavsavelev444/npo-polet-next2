"use client";

import { useEffect, useMemo, useState } from "react";
import { PRODUCT_SORTS, type ProductSort } from "../../lib/constants";
import type { ProductRow, ProductsDTO } from "../../lib/types";
import styles from "../analytics.module.css";
import { BarList, Delta, SegmentBar, StatTile, TipRow } from "../charts";
import { int, money, moneyCompact, pct, plural } from "../format";
import { useAnalyticsData } from "../useAnalyticsData";
import {
	Card,
	Frame,
	Note,
	type SectionProps,
	usePeriodReport,
} from "./shared";

const INVENTORY_LABELS: Record<string, string> = {
	available: "В наличии",
	preorder: "Предзаказ",
	out_of_stock: "Нет в наличии",
	discontinued: "Снят",
};

function productHref(id: number) {
	return `/admin/collections/products/${id}`;
}

export function ProductsSection({
	params,
	reloadKey,
	setParams,
	searchParams,
	onPeriod,
}: SectionProps) {
	const { data, error, loading } = useAnalyticsData(
		"products",
		params,
		reloadKey,
	);
	usePeriodReport(data?.period, onPeriod);

	return (
		<Frame loading={loading} error={error} hasData={Boolean(data)}>
			{data && (
				<div className={styles.grid12}>
					<Summary data={data} />
					<TopLists data={data} />
					<Structure
						data={data}
						setParams={setParams}
						category={searchParams.get("category")}
					/>
					<Demand data={data} />
					<ProductTable
						params={params}
						reloadKey={reloadKey}
						setParams={setParams}
						searchParams={searchParams}
					/>
				</div>
			)}
		</Frame>
	);
}

function Summary({ data }: { data: ProductsDTO }) {
	const s = data.summary;
	return (
		<>
			<div className={styles.tiles}>
				<StatTile
					label="Продано товаров"
					value={int(s.soldProducts)}
					hint="Разных товаров с продажами за период."
					delta={
						<Delta current={s.soldProducts} previous={s.prevSoldProducts} />
					}
					sub={`в продаже сейчас ${int(s.activeCatalog)}`}
				/>
				<StatTile
					label="Единицы"
					value={int(s.units)}
					delta={<Delta current={s.units} previous={s.prevUnits} />}
				/>
				<StatTile
					label="Товарная выручка"
					value={moneyCompact(s.revenue)}
					title={money(s.revenue)}
					hint="Сумма позиций: со скидкой товара, но до скидки корзины и промокода — они относятся к заказу целиком."
					delta={<Delta current={s.revenue} previous={s.prevRevenue} />}
				/>
				<StatTile
					label="Доля топ-10"
					value={pct(s.top10Share)}
					hint="Какую часть товарной выручки дают 10 самых прибыльных товаров. Чем выше, тем сильнее зависимость от них."
				/>
				<StatTile
					label="Без продаж"
					value={int(s.zeroSales)}
					hint="Товары в продаже без единой покупки за период."
					sub={
						s.activeCatalog > 0
							? `${pct(s.zeroSales / s.activeCatalog, 0)} ассортимента`
							: undefined
					}
				/>
			</div>
			<Note>
				Сверка: товарная выручка {money(s.revenue)} − скидки на заказ{" "}
				{money(s.orderDiscounts)} = выручка заказов{" "}
				{money(s.revenue - s.orderDiscounts)}
				{Math.abs(s.revenue - s.orderDiscounts - s.orderRevenue) > 0.5 &&
					` (заказы целиком: ${money(s.orderRevenue)})`}
				. Скидки на заказ между товарами не распределяются.
			</Note>
		</>
	);
}

function productBar(row: ProductRow, metric: "revenue" | "units") {
	return {
		key: String(row.productId),
		label: row.title,
		sub: row.category ?? undefined,
		value: row[metric],
		valueText:
			metric === "revenue" ? moneyCompact(row.revenue) : int(row.units),
		href: productHref(row.productId),
		aside:
			metric === "revenue"
				? `${int(row.units)} шт.`
				: moneyCompact(row.revenue),
		tip: (
			<>
				<div className={styles.tipTitle}>{row.title}</div>
				<TipRow value={money(row.revenue)} label="выручка" />
				<TipRow value={int(row.units)} label="единиц" />
				<TipRow value={int(row.orders)} label="заказов" />
				<TipRow value={int(row.customers)} label="покупателей" />
			</>
		),
	};
}

function TopLists({ data }: { data: ProductsDTO }) {
	return (
		<>
			<Card title="Больше всего выручки" span={6}>
				<BarList
					rows={data.topByRevenue.map((r) => productBar(r, "revenue"))}
				/>
			</Card>
			<Card title="Больше всего единиц" span={6}>
				<BarList rows={data.topByUnits.map((r) => productBar(r, "units"))} />
			</Card>
		</>
	);
}

function Structure({
	data,
	setParams,
	category,
}: {
	data: ProductsDTO;
	setParams: SectionProps["setParams"];
	category: string | null;
}) {
	const { abc } = data.summary;
	return (
		<>
			<Card
				title="Категории"
				hint="По товарной выручке. Нажмите, чтобы отфильтровать отчёт. Заказ с товарами двух категорий входит в заказы обеих."
				span={7}
			>
				<BarList
					rows={data.categories.map((row) => ({
						key: row.key,
						label: row.label,
						sub: `${int(row.products)} ${plural(row.products, ["товар", "товара", "товаров"])}`,
						value: row.revenue,
						valueText: moneyCompact(row.revenue),
						aside: <Delta current={row.revenue} previous={row.prevRevenue} />,
						selected: category === String(row.id),
						onSelect:
							row.id === null
								? undefined
								: () =>
										setParams({
											category:
												category === String(row.id) ? null : String(row.id),
										}),
						tip: (
							<>
								<div className={styles.tipTitle}>{row.label}</div>
								<TipRow value={money(row.revenue)} label="выручка" />
								<TipRow value={int(row.units)} label="единиц" />
								<TipRow value={int(row.orders)} label="заказов" />
								<TipRow value={int(row.customers)} label="покупателей" />
							</>
						),
					}))}
				/>
			</Card>
			<Card
				title="ABC-анализ"
				hint="Товары от самых прибыльных: A — первые 80% товарной выручки, B — следующие 15%, C — остальное."
				span={5}
			>
				<SegmentBar
					parts={(["A", "B", "C"] as const).map((key) => ({
						key,
						label: `Класс ${key}`,
						value: abc[key].revenue,
						valueText: money(abc[key].revenue),
					}))}
				/>
				<dl className={styles.kv}>
					{(["A", "B", "C"] as const).map((key) => (
						<div key={key} className={styles.kvRow}>
							<dt>Класс {key}</dt>
							<dd>
								{int(abc[key].products)}{" "}
								{plural(abc[key].products, ["товар", "товара", "товаров"])}{" "}
								<span className={styles.muted}>
									{moneyCompact(abc[key].revenue)}
								</span>
							</dd>
						</div>
					))}
				</dl>
			</Card>

			<Card title="Ценовые сегменты" hint="По цене единицы в заказе." span={4}>
				<BarList
					rows={data.priceBands.map((band) => ({
						key: band.key,
						label: band.label,
						value: band.revenue,
						valueText: moneyCompact(band.revenue),
						aside: `${int(band.units)} шт.`,
					}))}
				/>
			</Card>
			<Card
				title="Размер заказа"
				hint="Сколько разных позиций в заказе."
				span={4}
			>
				<BarList
					rows={data.basketSizes.map((band) => ({
						key: band.key,
						label: band.label,
						value: band.orders,
						valueText: int(band.orders),
						aside: moneyCompact(band.revenue),
					}))}
				/>
			</Card>
			<Card title="Производители" span={4}>
				<BarList
					rows={data.manufacturers.slice(0, 10).map((row) => ({
						key: row.key,
						label: row.label,
						value: row.revenue,
						valueText: moneyCompact(row.revenue),
						aside: `${int(row.units)} шт.`,
					}))}
				/>
			</Card>
		</>
	);
}

function Demand({ data }: { data: ProductsDTO }) {
	return (
		<>
			<Card
				title="Наименьший спрос"
				hint="Товары с продажами, которые продаются меньше всех."
				span={6}
			>
				<BarList rows={data.lowDemand.map((r) => productBar(r, "units"))} />
			</Card>
			<Card
				title={`Без продаж за период: ${int(data.summary.zeroSales)}`}
				hint="В продаже, покупок нет. Первыми — с наибольшим числом просмотров за всё время: интерес есть, продаж нет."
				span={6}
			>
				{data.zeroSales.length ? (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Товар</th>
									<th>Категория</th>
									<th className={styles.num}>Просмотры</th>
								</tr>
							</thead>
							<tbody>
								{data.zeroSales.map((row) => (
									<tr key={row.productId}>
										<td>
											<a href={productHref(row.productId)}>{row.title}</a>
										</td>
										<td>{row.category ?? "—"}</td>
										<td className={styles.num}>{int(row.views)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className={styles.empty}>
						Все товары в продаже покупали за период
					</p>
				)}
			</Card>
			<Card
				title="Часто покупают вместе"
				hint="Пары товаров в одном заказе."
				span={6}
			>
				{data.pairs.length ? (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Товар</th>
									<th>вместе с</th>
									<th className={styles.num}>Заказы</th>
								</tr>
							</thead>
							<tbody>
								{data.pairs.map((row) => (
									<tr key={`${row.a}|${row.b}`}>
										<td>{row.a}</td>
										<td>{row.b}</td>
										<td className={styles.num}>{int(row.orders)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className={styles.empty}>
						За период нет заказов с разными товарами
					</p>
				)}
			</Card>
			<Card
				title="Скрытый спрос"
				hint="Счётчики за всё время, не за период: подписки «сообщить о поступлении», избранное, просмотры и покупки."
				span={6}
			>
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Товар</th>
								<th className={styles.num}>Ждут</th>
								<th className={styles.num}>Избранное</th>
								<th className={styles.num}>Просмотры</th>
								<th className={styles.num}>Покупки</th>
							</tr>
						</thead>
						<tbody>
							{data.interest.map((row) => (
								<tr key={row.productId}>
									<td>
										<a href={productHref(row.productId)}>{row.title}</a>
									</td>
									<td className={styles.num}>{int(row.restock)}</td>
									<td className={styles.num}>{int(row.wishlists)}</td>
									<td className={styles.num}>{int(row.views)}</td>
									<td className={styles.num}>{int(row.purchases)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>
		</>
	);
}

const SORT_HEADERS: { key: ProductSort; label: string }[] = [
	{ key: "revenue", label: "Выручка" },
	{ key: "units", label: "Единицы" },
	{ key: "orders", label: "Заказы" },
	{ key: "customers", label: "Покупатели" },
	{ key: "avgPrice", label: "Ср. цена" },
	{ key: "voidUnits", label: "Отменено, шт." },
];

function ProductTable({
	params,
	reloadKey,
	setParams,
	searchParams,
}: {
	params: string;
	reloadKey: number;
	setParams: SectionProps["setParams"];
	searchParams: SectionProps["searchParams"];
}) {
	const rawSort = searchParams.get("sort");
	const sort: ProductSort = PRODUCT_SORTS.includes(rawSort as ProductSort)
		? (rawSort as ProductSort)
		: "revenue";
	const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
	const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
	const q = searchParams.get("q") ?? "";
	const [search, setSearch] = useState(q);

	// Поиск — с паузой: запрос на каждую букву не нужен ни базе, ни глазам.
	useEffect(() => {
		if (search === q) return;
		const timer = window.setTimeout(
			() => setParams({ q: search || null, page: null }),
			300,
		);
		return () => window.clearTimeout(timer);
	}, [search, q, setParams]);

	const tableParams = useMemo(() => {
		const out = new URLSearchParams(params);
		out.set("sort", sort);
		out.set("dir", dir);
		out.set("page", String(page));
		if (q) out.set("q", q);
		return out.toString();
	}, [params, sort, dir, page, q]);

	const { data, error, loading } = useAnalyticsData(
		"product_table",
		tableParams,
		reloadKey,
	);
	const ranking = data?.ranking;
	const pages = ranking
		? Math.max(1, Math.ceil(ranking.total / ranking.pageSize))
		: 1;
	// Номер, который применил сервер: адрес мог указывать за конец списка.
	const shownPage = ranking?.page ?? page;

	const toggleSort = (key: ProductSort) => {
		setParams({
			sort: key === "revenue" ? null : key,
			dir: sort === key && dir === "desc" ? "asc" : null,
			page: null,
		});
	};

	return (
		<Card
			title="Рейтинг товаров"
			hint="Сортировка, поиск и страницы считаются на сервере: класс ABC и доля — по всему набору."
			action={
				<input
					type="search"
					className={styles.searchInput}
					placeholder="Поиск по названию"
					aria-label="Поиск товара по названию"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
			}
		>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			<div className={loading ? styles.stale : undefined}>
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Товар</th>
								<th>ABC</th>
								{SORT_HEADERS.map((header) => (
									<th
										key={header.key}
										className={styles.num}
										aria-sort={
											sort === header.key
												? dir === "asc"
													? "ascending"
													: "descending"
												: "none"
										}
									>
										<button
											type="button"
											className={styles.sortButton}
											onClick={() => toggleSort(header.key)}
										>
											{header.label}
											{sort === header.key && (dir === "asc" ? " ↑" : " ↓")}
										</button>
									</th>
								))}
								<th className={styles.num}>Доля</th>
								<th className={styles.num}>К сравнению</th>
							</tr>
						</thead>
						<tbody>
							{ranking?.rows.map((row) => (
								<tr key={row.productId}>
									<td className={styles.cellTitle}>
										<a href={productHref(row.productId)}>{row.title}</a>
										<span className={styles.cellSub}>
											{row.category ?? "Без категории"}
											{row.inventoryStatus &&
												row.inventoryStatus !== "available" &&
												` · ${INVENTORY_LABELS[row.inventoryStatus] ?? row.inventoryStatus}`}
										</span>
									</td>
									<td>
										<span className={styles.abcBadge}>{row.abc}</span>
									</td>
									<td className={styles.num}>{money(row.revenue)}</td>
									<td className={styles.num}>{int(row.units)}</td>
									<td className={styles.num}>{int(row.orders)}</td>
									<td className={styles.num}>{int(row.customers)}</td>
									<td className={styles.num}>{money(row.avgPrice)}</td>
									<td className={styles.num}>{int(row.voidUnits)}</td>
									<td className={styles.num}>{pct(row.share)}</td>
									<td className={styles.num}>
										<Delta current={row.revenue} previous={row.prevRevenue} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{ranking && ranking.rows.length === 0 && (
					<p className={styles.empty}>
						{q ? "Ничего не найдено" : "Нет продаж за период"}
					</p>
				)}
			</div>
			{ranking && ranking.total > ranking.pageSize && (
				<nav className={styles.pager} aria-label="Страницы рейтинга">
					<button
						type="button"
						className={styles.ghostButton}
						disabled={shownPage <= 1}
						onClick={() =>
							setParams({
								page: shownPage <= 2 ? null : String(shownPage - 1),
							})
						}
					>
						← Назад
					</button>
					<span className={styles.muted}>
						Страница {int(shownPage)} из {int(pages)} · {int(ranking.total)}{" "}
						{plural(ranking.total, ["товар", "товара", "товаров"])}
					</span>
					<button
						type="button"
						className={styles.ghostButton}
						disabled={shownPage >= pages}
						onClick={() => setParams({ page: String(shownPage + 1) })}
					>
						Вперёд →
					</button>
				</nav>
			)}
		</Card>
	);
}
