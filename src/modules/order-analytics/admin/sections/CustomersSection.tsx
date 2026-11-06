"use client";

import { CUSTOMER_TYPE_LABELS } from "../../lib/constants";
import type { CustomersDTO } from "../../lib/types";
import styles from "../analytics.module.css";
import {
	BarList,
	Delta,
	SegmentBar,
	StackedColumns,
	StatTile,
	shade,
	TipRow,
} from "../charts";
import {
	dateTimeLabel,
	dayLabel,
	dec,
	int,
	money,
	moneyCompact,
	monthLabel,
	monthShort,
	pct,
	plural,
} from "../format";
import { useAnalyticsData } from "../useAnalyticsData";
import {
	Card,
	Frame,
	Note,
	type SectionProps,
	usePeriodReport,
} from "./shared";

const FREQUENCY_LABELS: Record<string, string> = {
	"1": "1 заказ",
	"2": "2 заказа",
	"3": "3 заказа",
	"4-5": "4–5 заказов",
	"6-10": "6–10 заказов",
	"11+": "11 и больше",
};

const RECENCY_LABELS: Record<string, string> = {
	"0-30": "до 30 дней",
	"31-90": "31–90 дней",
	"91-180": "91–180 дней",
	"181-365": "181–365 дней",
	"366+": "больше года",
};

export function CustomersSection({
	params,
	reloadKey,
	setParams,
	searchParams,
	onPeriod,
}: SectionProps) {
	const { data, error, loading } = useAnalyticsData(
		"customers",
		params,
		reloadKey,
	);
	usePeriodReport(data?.period, onPeriod);
	return (
		<Frame loading={loading} error={error} hasData={Boolean(data)}>
			{data && (
				<Customers
					data={data}
					customerType={searchParams.get("customerType")}
					setParams={setParams}
				/>
			)}
		</Frame>
	);
}

function Customers({
	data,
	customerType,
	setParams,
}: {
	data: CustomersDTO;
	customerType: string | null;
	setParams: SectionProps["setParams"];
}) {
	const { current: c, previous: p, period } = data;
	const totalTypeRevenue = data.types.reduce((s, t) => s + t.revenue, 0);

	return (
		<div className={styles.grid12}>
			<div className={styles.tiles}>
				<StatTile
					label="Покупатели"
					value={int(c.customers)}
					hint="Учётные записи с действующим заказом за период."
					delta={<Delta current={c.customers} previous={p?.customers} />}
				/>
				<StatTile
					label="Новые"
					value={int(c.newCustomers)}
					hint="Первый действующий заказ за всю историю сделан в этом периоде."
					delta={<Delta current={c.newCustomers} previous={p?.newCustomers} />}
					sub={pct(c.customers > 0 ? c.newCustomers / c.customers : null, 0)}
				/>
				<StatTile
					label="Постоянные"
					value={int(c.returningCustomers)}
					hint="Покупали и до начала периода."
					delta={
						<Delta
							current={c.returningCustomers}
							previous={p?.returningCustomers}
						/>
					}
					sub={pct(
						c.customers > 0 ? c.returningCustomers / c.customers : null,
						0,
					)}
				/>
				<StatTile
					label="Повторные заказы"
					value={int(c.repeatOrders)}
					hint="Заказы периода, которые не были первым заказом клиента. Клиент определяется по учётной записи."
					delta={<Delta current={c.repeatOrders} previous={p?.repeatOrders} />}
					sub={`${pct(c.repeatOrderShare, 0)} заказов · ${moneyCompact(c.repeatOrderRevenue)}`}
				/>
				<StatTile
					label="Доля с повторной покупкой"
					value={pct(c.repeatRate)}
					hint="Покупатели периода, у которых к его концу два действующих заказа или больше за всю историю."
					delta={
						<Delta
							current={c.repeatRate}
							previous={p?.repeatRate}
							mode="points"
						/>
					}
					sub={`${int(c.repeatCustomers)} из ${int(c.customers)}`}
				/>
				<StatTile
					label="Заказов на клиента"
					value={dec(c.ordersPerCustomer)}
					hint="Среднее число заказов покупателя внутри периода."
					delta={
						<Delta
							current={c.ordersPerCustomer}
							previous={p?.ordersPerCustomer}
						/>
					}
					sub={`купили 2+ раза в периоде: ${int(c.repeatWithinPeriod)}`}
				/>
				<StatTile
					label="Выручка на клиента"
					value={money(c.revenuePerCustomer)}
					delta={
						<Delta
							current={c.revenuePerCustomer}
							previous={p?.revenuePerCustomer}
						/>
					}
				/>
				<StatTile
					label="Интервал покупок"
					value={
						c.medianDaysBetweenOrders === null
							? "—"
							: `${dec(c.medianDaysBetweenOrders)} дн.`
					}
					hint="Медиана дней между соседними заказами одного клиента. Считается по повторным заказам периода."
					sub={`по ${int(c.daysBetweenSample)} ${plural(c.daysBetweenSample, ["заказу", "заказам", "заказам"])}`}
				/>
			</div>

			{c.unattributedOrders > 0 && (
				<Note>
					Заказов без покупателя: {int(c.unattributedOrders)} на{" "}
					{money(c.unattributedRevenue)}. Это обезличенные заказы удалённых
					аккаунтов и перенесённые без владельца. В показатели клиентов они не
					входят, потому что клиента определить нельзя: получателем бывает
					другой человек.
				</Note>
			)}

			<Card
				title="Типы покупателей"
				hint={`Заказы и деньги — по типу в самом заказе. Клиент считается один раз, по последнему заказу периода${
					data.mixedTypeCustomers > 0
						? `; покупали в нескольких типах: ${int(data.mixedTypeCustomers)}`
						: ""
				}.`}
				span={7}
			>
				<SegmentBar
					parts={data.types.map((row) => ({
						key: row.type,
						label: CUSTOMER_TYPE_LABELS[row.type],
						value: row.revenue,
						valueText: money(row.revenue),
					}))}
				/>
				{data.types.length > 0 && (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Тип</th>
									<th className={styles.num}>Клиенты</th>
									<th className={styles.num}>Заказы</th>
									<th className={styles.num}>Выручка</th>
									<th className={styles.num}>Доля</th>
									<th className={styles.num}>Средний чек</th>
								</tr>
							</thead>
							<tbody>
								{data.types.map((row) => (
									<tr key={row.type}>
										<td>
											<button
												type="button"
												className={styles.linkButton}
												aria-pressed={customerType === row.type}
												onClick={() =>
													setParams({
														customerType:
															customerType === row.type ? null : row.type,
													})
												}
											>
												{CUSTOMER_TYPE_LABELS[row.type]}
											</button>
										</td>
										<td className={styles.num}>{int(row.customers)}</td>
										<td className={styles.num}>{int(row.orders)}</td>
										<td className={styles.num}>{money(row.revenue)}</td>
										<td className={styles.num}>
											{pct(
												totalTypeRevenue > 0
													? row.revenue / totalTypeRevenue
													: null,
												0,
											)}
										</td>
										<td className={styles.num}>{money(row.avgCheck)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			<Card
				title="Новые и постоянные: деньги"
				hint="Первые заказы клиентов против повторных."
				span={5}
			>
				<SegmentBar
					parts={[
						{
							key: "first",
							label: "Первые заказы",
							value: c.firstOrderRevenue,
							valueText: money(c.firstOrderRevenue),
						},
						{
							key: "repeat",
							label: "Повторные заказы",
							value: c.repeatOrderRevenue,
							valueText: money(c.repeatOrderRevenue),
						},
					]}
				/>
				<dl className={styles.kv}>
					<div className={styles.kvRow}>
						<dt>Первые заказы</dt>
						<dd>
							{int(c.firstOrders)}{" "}
							<span className={styles.muted}>{money(c.firstOrderRevenue)}</span>
						</dd>
					</div>
					<div className={styles.kvRow}>
						<dt>Повторные заказы</dt>
						<dd>
							{int(c.repeatOrders)}{" "}
							<span className={styles.muted}>
								{money(c.repeatOrderRevenue)}
							</span>
						</dd>
					</div>
				</dl>
			</Card>

			<Card title="Первые и повторные заказы по времени" span={8}>
				<StackedColumns
					series={[
						{
							label: "Первые заказы",
							className: styles.fillOne,
							keyClass: styles.keyOne,
						},
						{
							label: "Повторные заказы",
							className: styles.fillTwo,
							keyClass: styles.keyTwo,
						},
					]}
					points={data.series.map((point) => ({
						key: point.start,
						label:
							period.granularity === "month"
								? monthShort(point.start)
								: dayLabel(point.start),
						tip:
							period.granularity === "month"
								? monthLabel(point.start)
								: dayLabel(point.start, true),
						values: [point.firstOrders, point.repeatOrders],
					}))}
				/>
			</Card>
			<Card
				title="Частота покупок"
				hint="Сколько заказов сделал клиент внутри периода."
				span={4}
			>
				<BarList
					rows={data.frequency.map((row) => ({
						key: row.key,
						label: FREQUENCY_LABELS[row.key] ?? row.key,
						value: row.customers,
						valueText: int(row.customers),
						aside: moneyCompact(row.revenue),
						tip: (
							<>
								<div className={styles.tipTitle}>
									{FREQUENCY_LABELS[row.key]}
								</div>
								<TipRow value={int(row.customers)} label="клиентов" />
								<TipRow value={money(row.revenue)} label="выручка" />
							</>
						),
					}))}
				/>
			</Card>

			<Cohorts data={data} />

			<Card
				title="Давность покупок"
				hint="Вся база клиентов на конец периода: сколько прошло с последнего заказа. Фильтры не применяются."
				span={4}
			>
				<BarList
					rows={data.recency.map((row) => ({
						key: row.key,
						label: RECENCY_LABELS[row.key] ?? row.key,
						value: row.customers,
						valueText: int(row.customers),
					}))}
				/>
			</Card>

			<Card
				title="Лучшие клиенты"
				hint="По выручке за период, первые 20."
				span={8}
			>
				{data.topCustomers.length ? (
					<div className={styles.tableWrapTall}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Клиент</th>
									<th className={styles.num}>Выручка</th>
									<th className={styles.num}>Заказы</th>
									<th className={styles.num}>Всего заказов</th>
									<th className={styles.num}>Последний</th>
								</tr>
							</thead>
							<tbody>
								{data.topCustomers.map((row) => (
									<tr key={row.userId}>
										<td className={styles.cellTitle}>
											<a href={`/admin/collections/users/${row.userId}`}>
												{row.name}
											</a>
											<span className={styles.cellSub}>
												{row.company ?? CUSTOMER_TYPE_LABELS[row.type]}
											</span>
										</td>
										<td className={styles.num}>{money(row.revenue)}</td>
										<td className={styles.num}>{int(row.orders)}</td>
										<td className={styles.num}>{int(row.lifetimeOrders)}</td>
										<td className={styles.num}>
											{dateTimeLabel(row.lastOrderAt)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className={styles.empty}>Нет данных за период</p>
				)}
			</Card>
		</div>
	);
}

function Cohorts({ data }: { data: CustomersDTO }) {
	const { rows, maxOffset } = data.cohorts;
	const offsets = Array.from({ length: maxOffset + 1 }, (_, index) => index);
	return (
		<Card
			title="Удержание по когортам"
			hint="Клиенты сгруппированы по месяцу первой покупки; в ячейке — доля тех, кто покупал через N месяцев. Последние 12 месяцев до конца периода, фильтры не применяются."
			span={8}
		>
			{rows.length ? (
				<div className={styles.tableWrap}>
					<table className={styles.cohort}>
						<thead>
							<tr>
								<th>Когорта</th>
								<th className={styles.num}>Клиентов</th>
								{offsets.map((offset) => (
									<th key={offset} className={styles.num}>
										+{offset}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.cohort}>
									<td>{monthShort(row.cohort)}</td>
									<td className={styles.num}>{int(row.size)}</td>
									{row.retention.map((value, offset) => (
										<td
											key={offset}
											className={
												value === null ? styles.cohortNone : styles.cohortCell
											}
											style={value === null ? undefined : shade(value)}
										>
											{value === null ? "" : pct(value, 0)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className={styles.empty}>Нет данных для когорт</p>
			)}
		</Card>
	);
}
