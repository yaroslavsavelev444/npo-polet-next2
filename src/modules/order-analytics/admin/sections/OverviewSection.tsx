"use client";

import { useMemo, useState } from "react";
import { ORDER_STATUS_LABELS } from "@/modules/orders/lib/status.groups";
import {
	DELIVERY_LABELS,
	type Granularity,
	PAYMENT_LABELS,
	PAYMENT_STATUS_LABELS,
	SOURCE_LABELS,
} from "../../lib/constants";
import type { OverviewDTO, SeriesPoint, Totals } from "../../lib/types";
import styles from "../analytics.module.css";
import {
	BarList,
	Delta,
	Heatmap,
	SegmentBar,
	StatTile,
	TimeChart,
	type TimePoint,
	TipRow,
} from "../charts";
import {
	dayLabel,
	dec,
	int,
	money,
	moneyCompact,
	monthLabel,
	monthShort,
	pct,
	plural,
	rangeLabel,
} from "../format";
import { useAnalyticsData } from "../useAnalyticsData";
import {
	Card,
	compareName,
	Frame,
	type SectionProps,
	Segmented,
	usePeriodReport,
} from "./shared";

type Metric = "revenue" | "orders" | "avgCheck" | "units";

const METRICS: {
	value: Metric;
	label: string;
	format: (value: number) => string;
}[] = [
	{ value: "revenue", label: "Выручка", format: money },
	{ value: "orders", label: "Заказы", format: int },
	{ value: "avgCheck", label: "Средний чек", format: money },
	{ value: "units", label: "Единицы", format: int },
];

const WEEKDAY_NAMES = [
	"понедельник",
	"вторник",
	"среду",
	"четверг",
	"пятницу",
	"субботу",
	"воскресенье",
];

function axisLabel(point: SeriesPoint, granularity: Granularity) {
	if (granularity === "month") return monthShort(point.start);
	return dayLabel(point.start);
}

function tipLabel(point: SeriesPoint, granularity: Granularity) {
	const base =
		granularity === "day"
			? dayLabel(point.start, true)
			: granularity === "week"
				? rangeLabel(point.start, point.end)
				: monthLabel(point.start);
	return point.partial ? `${base} (период захватывает не весь шаг)` : base;
}

function metricValue(point: SeriesPoint, metric: Metric): number | null {
	return metric === "avgCheck" ? point.avgCheck : point[metric];
}

export function OverviewSection({
	params,
	reloadKey,
	setParams,
	searchParams,
	onPeriod,
}: SectionProps) {
	const { data, error, loading } = useAnalyticsData(
		"overview",
		params,
		reloadKey,
	);
	usePeriodReport(data?.period, onPeriod);
	const [metric, setMetric] = useState<Metric>("revenue");

	return (
		<Frame loading={loading} error={error} hasData={Boolean(data)}>
			{data && (
				<Overview
					data={data}
					metric={metric}
					setMetric={setMetric}
					setParams={setParams}
					statusFilter={searchParams.get("status")}
				/>
			)}
		</Frame>
	);
}

function Overview({
	data,
	metric,
	setMetric,
	setParams,
	statusFilter,
}: {
	data: OverviewDTO;
	metric: Metric;
	setMetric: (metric: Metric) => void;
	setParams: SectionProps["setParams"];
	statusFilter: string | null;
}) {
	const { current: c, previous: p, period } = data;
	const definition = METRICS.find((m) => m.value === metric) ?? METRICS[0];
	const name = compareName(period.compareMode);

	const points = useMemo<TimePoint[]>(
		() =>
			data.series.map((point, index) => {
				const other = data.previousSeries?.[index];
				return {
					key: point.start,
					axisLabel: axisLabel(point, period.granularity),
					tipLabel: tipLabel(point, period.granularity),
					value: metricValue(point, metric),
					...(data.previousSeries
						? {
								compare: other ? metricValue(other, metric) : null,
								compareTipLabel: other
									? tipLabel(other, period.granularity)
									: "нет данных",
							}
						: {}),
				};
			}),
		[data, metric, period.granularity],
	);

	const insights = buildInsights(data, c, p, name);

	return (
		<div className={styles.grid12}>
			<div className={styles.tiles}>
				<StatTile
					label="Выручка"
					value={moneyCompact(c.revenue)}
					title={money(c.revenue)}
					hint="Сумма действующих заказов (pricing.total). Отменённые и возвращённые не входят."
					delta={<Delta current={c.revenue} previous={p?.revenue} />}
					sub={`на покупателя ${money(c.revenuePerCustomer)}`}
				/>
				<StatTile
					label="Заказы"
					value={int(c.orders)}
					hint="Действующие заказы. Всего оформлено — вместе с отменами и возвратами."
					delta={<Delta current={c.orders} previous={p?.orders} />}
					sub={`всего оформлено ${int(c.placed)}`}
				/>
				<StatTile
					label="Средний чек"
					value={money(c.avgCheck)}
					hint="Выручка ÷ действующие заказы. Медиана не зависит от единичных крупных заказов."
					delta={<Delta current={c.avgCheck} previous={p?.avgCheck} />}
					sub={`медиана ${money(c.medianCheck)}`}
				/>
				<StatTile
					label="Покупатели"
					value={int(c.customers)}
					hint="Уникальные учётные записи с действующим заказом за период."
					delta={<Delta current={c.customers} previous={p?.customers} />}
				/>
				<StatTile
					label="Продано единиц"
					value={int(c.units)}
					hint="Сумма количества в позициях действующих заказов."
					delta={<Delta current={c.units} previous={p?.units} />}
					sub={`на заказ ${dec(c.unitsPerOrder)} · позиций ${dec(c.positionsPerOrder)}`}
				/>
				<StatTile
					label="Доля отмен"
					value={pct(c.voidRate)}
					hint="Отменённые и возвращённые ÷ все оформленные заказы."
					delta={
						<Delta
							current={c.voidRate}
							previous={p?.voidRate}
							mode="points"
							inverse
						/>
					}
					sub={`потеряно ${moneyCompact(c.lostRevenue)}`}
				/>
				<StatTile
					label="Оплачено"
					value={moneyCompact(c.paidRevenue)}
					title={money(c.paidRevenue)}
					hint="Действующие заказы со статусом оплаты «Оплачен». Статус ставит менеджер."
					delta={<Delta current={c.paidRevenue} previous={p?.paidRevenue} />}
					sub={`${pct(c.revenue > 0 ? c.paidRevenue / c.revenue : null, 0)} выручки · ${int(c.paid)} ${plural(c.paid, ["заказ", "заказа", "заказов"])}`}
				/>
				<StatTile
					label="Скидки"
					value={moneyCompact(c.discount)}
					title={money(c.discount)}
					hint="Все скидки заказа (товара, корзины, промокода) ÷ сумма до скидок."
					delta={
						<Delta
							current={c.discountRate}
							previous={p?.discountRate}
							mode="points"
							inverse
						/>
					}
					sub={`${pct(c.discountRate)} от суммы до скидок`}
				/>
			</div>

			{insights.length > 0 && (
				<Card title="Что важно за период" span={12}>
					<ul className={styles.insights}>
						{insights.map((text) => (
							<li key={text}>{text}</li>
						))}
					</ul>
				</Card>
			)}

			<Card
				title="Динамика"
				hint={
					data.previousSeries
						? "Серая линия — период сравнения, совмещён по порядку шагов."
						: undefined
				}
				action={
					<Segmented
						label="Показатель графика"
						value={metric}
						onChange={setMetric}
						options={METRICS}
					/>
				}
			>
				<TimeChart
					points={points}
					formatValue={definition.format}
					seriesLabel={definition.label}
					compareLabel={
						period.compare
							? rangeLabel(period.compare.from, period.compare.to)
							: undefined
					}
				/>
				<details className={styles.tableToggle}>
					<summary>Таблица значений</summary>
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Шаг</th>
									<th className={styles.num}>Выручка</th>
									<th className={styles.num}>Заказы</th>
									<th className={styles.num}>Оформлено</th>
									<th className={styles.num}>Средний чек</th>
									<th className={styles.num}>Единицы</th>
								</tr>
							</thead>
							<tbody>
								{data.series.map((point) => (
									<tr key={point.start}>
										<td>{tipLabel(point, period.granularity)}</td>
										<td className={styles.num}>{money(point.revenue)}</td>
										<td className={styles.num}>{int(point.orders)}</td>
										<td className={styles.num}>{int(point.placed)}</td>
										<td className={styles.num}>{money(point.avgCheck)}</td>
										<td className={styles.num}>{int(point.units)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</details>
			</Card>

			<Card
				title="Статусы заказов"
				hint="Все оформленные заказы периода. Нажмите на статус, чтобы отфильтровать отчёт."
				span={7}
			>
				<BarList
					rows={data.statuses.map((row) => ({
						key: row.status,
						label: ORDER_STATUS_LABELS[row.status],
						value: row.orders,
						valueText: int(row.orders),
						aside: money(row.amount),
						selected: statusFilter === row.status,
						onSelect: () =>
							setParams({
								status: statusFilter === row.status ? null : row.status,
							}),
						tip: (
							<>
								<div className={styles.tipTitle}>
									{ORDER_STATUS_LABELS[row.status]}
								</div>
								<TipRow value={int(row.orders)} label="заказов" />
								<TipRow value={money(row.amount)} label="на сумму" />
								<TipRow
									value={pct(c.placed > 0 ? row.orders / c.placed : null)}
									label="от оформленных"
								/>
							</>
						),
					}))}
				/>
			</Card>

			<Card
				title="Куда пришла выручка"
				hint="Оформленные заказы периода по сумме: дошли до покупателя, ещё в работе или потеряны."
				span={5}
			>
				<SegmentBar
					parts={[
						{
							key: "delivered",
							label: "Получено",
							value: c.deliveredRevenue,
							valueText: money(c.deliveredRevenue),
						},
						{
							key: "open",
							label: "В работе",
							value: c.openRevenue,
							valueText: money(c.openRevenue),
						},
						{
							key: "lost",
							label: "Отмены и возвраты",
							value: c.lostRevenue,
							valueText: money(c.lostRevenue),
						},
					]}
				/>
				<dl className={styles.kv}>
					<dt>Получено</dt>
					<dd>
						{money(c.deliveredRevenue)}{" "}
						<span className={styles.muted}>{int(c.delivered)} шт.</span>
					</dd>
					<dt>В работе</dt>
					<dd>
						{money(c.openRevenue)}{" "}
						<span className={styles.muted}>{int(c.open)} шт.</span>
					</dd>
					<dt>Отмены и возвраты</dt>
					<dd>
						{money(c.lostRevenue)}{" "}
						<span className={styles.muted}>
							{int(c.cancelled + c.refunded)} шт.
						</span>
					</dd>
				</dl>
			</Card>

			<Card title="Способ доставки" span={4}>
				<MixBars
					rows={data.delivery}
					labels={DELIVERY_LABELS}
					selected={null}
					onSelect={(key) => setParams({ delivery: key })}
				/>
			</Card>
			<Card title="Способ оплаты" span={4}>
				<MixBars
					rows={data.payment}
					labels={PAYMENT_LABELS}
					selected={null}
					onSelect={(key) => setParams({ payment: key })}
				/>
			</Card>
			<Card title="Статус оплаты" span={4}>
				<MixBars
					rows={data.paymentStatus}
					labels={PAYMENT_STATUS_LABELS}
					selected={null}
					onSelect={(key) => setParams({ paymentStatus: key })}
				/>
			</Card>

			<Card
				title="Когда покупают"
				hint="Действующие заказы по дню недели и часу, время московское."
				span={8}
			>
				<Heatmap grid={data.heatmap} />
			</Card>
			<Card
				title="Промокоды"
				hint={`Заказов с промокодом: ${int(data.promo.orders)} из ${int(c.orders)}. Скидка: ${money(data.promo.discount)}.`}
				span={4}
			>
				<BarList
					empty="Заказов с промокодом за период нет"
					rows={data.promo.top.map((row) => ({
						key: row.code,
						label: row.code,
						sub: `${int(row.orders)} ${plural(row.orders, ["заказ", "заказа", "заказов"])}`,
						value: row.revenue,
						valueText: moneyCompact(row.revenue),
						tip: (
							<>
								<div className={styles.tipTitle}>{row.code}</div>
								<TipRow value={money(row.revenue)} label="выручка" />
								<TipRow value={money(row.discount)} label="скидка" />
								<TipRow value={int(row.orders)} label="заказов" />
							</>
						),
					}))}
				/>
			</Card>

			{data.source.length > 1 && (
				<Card title="Источник заказа" span={4}>
					<MixBars
						rows={data.source}
						labels={SOURCE_LABELS}
						selected={null}
						onSelect={(key) => setParams({ source: key })}
					/>
				</Card>
			)}
		</div>
	);
}

function MixBars({
	rows,
	labels,
	onSelect,
}: {
	rows: OverviewDTO["delivery"];
	labels: Record<string, string>;
	selected: string | null;
	onSelect: (key: string) => void;
}) {
	return (
		<BarList
			rows={rows.map((row) => ({
				key: row.key,
				label: labels[row.key] ?? row.key,
				value: row.orders,
				valueText: int(row.orders),
				aside: moneyCompact(row.revenue),
				onSelect: () => onSelect(row.key),
				tip: (
					<>
						<div className={styles.tipTitle}>{labels[row.key] ?? row.key}</div>
						<TipRow value={int(row.orders)} label="заказов" />
						<TipRow value={money(row.revenue)} label="выручка" />
					</>
				),
			}))}
		/>
	);
}

/** Несколько прямых выводов из тех же цифр: только то, что следует из данных. */
function buildInsights(
	data: OverviewDTO,
	c: Totals,
	p: Totals | null,
	compare: string,
): string[] {
	const out: string[] = [];
	if (c.placed === 0) return out;

	if (p && p.revenue > 0) {
		const change = (c.revenue - p.revenue) / p.revenue;
		const avgChange =
			c.avgCheck !== null && p.avgCheck
				? (c.avgCheck - p.avgCheck) / p.avgCheck
				: null;
		const orderChange = p.orders > 0 ? (c.orders - p.orders) / p.orders : null;
		out.push(
			`Выручка ${change >= 0 ? "выросла" : "снизилась"} на ${pct(Math.abs(change))} ${compare}: заказы ${formatSigned(orderChange)}, средний чек ${formatSigned(avgChange)}.`,
		);
	}

	let bestDay = -1;
	let bestHour = -1;
	let bestValue = 0;
	data.heatmap.forEach((row, day) => {
		row.forEach((value, hour) => {
			if (value > bestValue) {
				bestValue = value;
				bestDay = day;
				bestHour = hour;
			}
		});
	});
	if (bestValue >= 3) {
		out.push(
			`Пик заказов — ${WEEKDAY_NAMES[bestDay]}, с ${bestHour}:00 до ${bestHour + 1}:00: ${int(bestValue)} ${plural(bestValue, ["заказ", "заказа", "заказов"])}.`,
		);
	}

	if (c.open > 0) {
		out.push(
			`В работе ${int(c.open)} ${plural(c.open, ["заказ", "заказа", "заказов"])} на ${money(c.openRevenue)} — эти деньги ещё не дошли до покупателя.`,
		);
	}

	if (c.revenue > 0 && c.paidRevenue < c.revenue) {
		out.push(
			`Не оплачено ${money(c.revenue - c.paidRevenue)} действующих заказов (${pct(1 - c.paidRevenue / c.revenue, 0)} выручки).`,
		);
	}
	return out;
}

function formatSigned(value: number | null): string {
	if (value === null) return "—";
	return `${value >= 0 ? "+" : "−"}${pct(Math.abs(value))}`;
}
