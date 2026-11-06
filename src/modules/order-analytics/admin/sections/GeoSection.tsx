"use client";

import { useState } from "react";
import { REGION_SPECIAL_LABELS } from "../../lib/constants";
import type { GeoDTO, GeoRow } from "../../lib/types";
import styles from "../analytics.module.css";
import { BarList, Delta, StatTile, TipRow } from "../charts";
import { int, money, moneyCompact, pct } from "../format";
import { useAnalyticsData } from "../useAnalyticsData";
import {
	Card,
	Frame,
	Note,
	type SectionProps,
	Segmented,
	usePeriodReport,
} from "./shared";

type GeoMetric = "orders" | "revenue";

const METRIC_OPTIONS: { value: GeoMetric; label: string }[] = [
	{ value: "orders", label: "Заказы" },
	{ value: "revenue", label: "Выручка" },
];

const VISIBLE_BARS = 12;

export function GeoSection({
	params,
	reloadKey,
	setParams,
	searchParams,
	onPeriod,
}: SectionProps) {
	const { data, error, loading } = useAnalyticsData("geo", params, reloadKey);
	usePeriodReport(data?.period, onPeriod);
	const [metric, setMetric] = useState<GeoMetric>("orders");

	return (
		<Frame loading={loading} error={error} hasData={Boolean(data)}>
			{data && (
				<Geo
					data={data}
					metric={metric}
					setMetric={setMetric}
					region={searchParams.get("region")}
					setParams={setParams}
				/>
			)}
		</Frame>
	);
}

function geoBar(row: GeoRow, metric: GeoMetric) {
	return {
		key: row.key,
		label: row.label,
		value: row[metric],
		valueText:
			metric === "orders" ? int(row.orders) : moneyCompact(row.revenue),
		aside:
			metric === "orders"
				? moneyCompact(row.revenue)
				: `${int(row.orders)} шт.`,
		tip: (
			<>
				<div className={styles.tipTitle}>{row.label}</div>
				<TipRow value={int(row.orders)} label="заказов" />
				<TipRow value={money(row.revenue)} label="выручка" />
				<TipRow value={int(row.customers)} label="покупателей" />
				<TipRow value={money(row.avgCheck)} label="средний чек" />
			</>
		),
	};
}

function Geo({
	data,
	metric,
	setMetric,
	region,
	setParams,
}: {
	data: GeoDTO;
	metric: GeoMetric;
	setMetric: (metric: GeoMetric) => void;
	region: string | null;
	setParams: SectionProps["setParams"];
}) {
	const { leaders, coverage, totals } = data;
	const covered =
		totals.orders > 0 ? coverage.withRegion / totals.orders : null;

	const toggle = (key: string) =>
		setParams({ region: region === key ? null : key });

	return (
		<div className={styles.grid12}>
			<div className={styles.tiles}>
				<StatTile
					label="Больше всего заказов"
					value={leaders.byOrders?.label ?? "—"}
					sub={
						leaders.byOrders
							? `${int(leaders.byOrders.orders)} заказов · ${moneyCompact(leaders.byOrders.revenue)}`
							: undefined
					}
				/>
				<StatTile
					label="Больше всего выручки"
					value={leaders.byRevenue?.label ?? "—"}
					sub={
						leaders.byRevenue
							? `${moneyCompact(leaders.byRevenue.revenue)} · ср. чек ${money(leaders.byRevenue.avgCheck)}`
							: undefined
					}
				/>
				<StatTile
					label="Быстрее всего растёт"
					value={leaders.fastestGrowth?.label ?? "—"}
					hint="Наибольший рост числа заказов среди регионов минимум с 3 заказами и ненулевым периодом сравнения."
					sub={
						leaders.fastestGrowth
							? `${int(leaders.fastestGrowth.prevOrders)} → ${int(leaders.fastestGrowth.orders)} заказов`
							: "Недостаточно данных для сравнения"
					}
				/>
				<StatTile
					label="Регион известен"
					value={pct(covered, 0)}
					hint="Доля действующих заказов, у которых указан регион доставки."
					sub={`${int(coverage.withRegion)} из ${int(totals.orders)} заказов`}
				/>
			</div>

			{(coverage.unknownRegion > 0 || coverage.pickup > 0) && (
				<Note>
					Без региона покупателя: самовывоз — {int(coverage.pickup)}, адрес без
					региона — {int(coverage.unknownRegion)}. Регион не угадывается: старые
					заказы хранят адрес одной строкой, у заказов удалённых аккаунтов
					адреса нет, а самовывоз говорит о нашем пункте выдачи, а не о том,
					откуда покупатель.
				</Note>
			)}

			<Card
				title="Регионы"
				hint="Нажмите на регион, чтобы отфильтровать весь отчёт."
				span={6}
				action={
					<Segmented
						label="Показатель"
						value={metric}
						onChange={setMetric}
						options={METRIC_OPTIONS}
					/>
				}
			>
				<BarList
					rows={[...data.regions.rows]
						.sort((a, b) => b[metric] - a[metric])
						.slice(0, VISIBLE_BARS)
						.map((row) => ({
							...geoBar(row, metric),
							selected: region === row.key,
							onSelect: () => toggle(row.key),
						}))}
				/>
			</Card>
			<Card
				title="Города"
				hint="«г Калуга» и «Калуга» — один город. Самовывоз сюда не входит."
				span={6}
			>
				<BarList
					rows={[...data.cities.rows]
						.sort((a, b) => b[metric] - a[metric])
						.slice(0, VISIBLE_BARS)
						.map((row) => geoBar(row, metric))}
				/>
			</Card>

			<GeoTable
				title="Активность регионов"
				rows={data.regions.rows}
				total={data.regions.total}
				grandTotal={totals}
			/>
			<GeoTable
				title="Активность городов"
				rows={data.cities.rows}
				total={data.cities.total}
			/>

			{data.pickupPoints.length > 0 && (
				<Card title="Пункты самовывоза" span={12}>
					<BarList
						rows={data.pickupPoints.map((row) => geoBar(row, "orders"))}
					/>
				</Card>
			)}
		</div>
	);
}

function GeoTable({
	title,
	rows,
	total,
	grandTotal,
}: {
	title: string;
	rows: GeoRow[];
	total: number;
	grandTotal?: { orders: number; revenue: number };
}) {
	const hidden = total - rows.length;
	const shownOrders = rows.reduce((sum, row) => sum + row.orders, 0);
	const shownRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
	return (
		<Card
			title={title}
			hint={
				hidden > 0
					? `Показаны первые ${int(rows.length)} из ${int(total)} по числу заказов.`
					: undefined
			}
			span={12}
		>
			{rows.length ? (
				<div className={styles.tableWrapTall}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Название</th>
								<th className={styles.num}>Заказы</th>
								<th className={styles.num}>К сравнению</th>
								<th className={styles.num}>Выручка</th>
								<th className={styles.num}>К сравнению</th>
								<th className={styles.num}>Покупатели</th>
								<th className={styles.num}>Заказов на покупателя</th>
								<th className={styles.num}>Средний чек</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.key}>
									<td
										className={
											row.key in REGION_SPECIAL_LABELS
												? styles.muted
												: undefined
										}
									>
										{row.label}
									</td>
									<td className={styles.num}>{int(row.orders)}</td>
									<td className={styles.num}>
										<Delta current={row.orders} previous={row.prevOrders} />
									</td>
									<td className={styles.num}>{money(row.revenue)}</td>
									<td className={styles.num}>
										<Delta current={row.revenue} previous={row.prevRevenue} />
									</td>
									<td className={styles.num}>{int(row.customers)}</td>
									<td className={styles.num}>
										{row.customers > 0
											? (row.orders / row.customers).toLocaleString("ru-RU", {
													maximumFractionDigits: 1,
												})
											: "—"}
									</td>
									<td className={styles.num}>{money(row.avgCheck)}</td>
								</tr>
							))}
						</tbody>
						{grandTotal && hidden > 0 && (
							<tfoot>
								<tr>
									<td>Остальные ({int(hidden)})</td>
									<td className={styles.num}>
										{int(grandTotal.orders - shownOrders)}
									</td>
									<td />
									<td className={styles.num}>
										{money(grandTotal.revenue - shownRevenue)}
									</td>
									<td colSpan={4} />
								</tr>
							</tfoot>
						)}
					</table>
				</div>
			) : (
				<p className={styles.empty}>Нет данных за период</p>
			)}
		</Card>
	);
}
