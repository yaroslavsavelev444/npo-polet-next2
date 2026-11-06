"use client";

import { ORDER_STATUS_LABELS } from "@/modules/orders/lib/status.groups";
import {
	CUSTOMER_TYPE_LABELS,
	DELIVERY_LABELS,
	PAYMENT_LABELS,
} from "../../lib/constants";
import type { FunnelDTO, VoidSliceRow } from "../../lib/types";
import styles from "../analytics.module.css";
import { BarList, Delta, FunnelBars, StatTile } from "../charts";
import { dec, hoursLabel, int, money, moneyCompact, pct } from "../format";
import { useAnalyticsData } from "../useAnalyticsData";
import {
	Card,
	Frame,
	Note,
	type SectionProps,
	usePeriodReport,
} from "./shared";

const AGE_LABELS: Record<string, string> = {
	"0-3": "до 3 дней",
	"4-7": "4–7 дней",
	"8-14": "8–14 дней",
	"15-30": "15–30 дней",
	"31+": "больше 30 дней",
};

const SLICE_TITLES: Record<VoidSliceRow["dimension"], string> = {
	delivery: "По доставке",
	payment: "По оплате",
	customerType: "По типу покупателя",
};

function sliceLabel(row: VoidSliceRow): string {
	const labels: Record<string, string> = {
		...DELIVERY_LABELS,
		...PAYMENT_LABELS,
		...CUSTOMER_TYPE_LABELS,
	};
	return labels[row.key] ?? row.key;
}

export function FunnelSection({ params, reloadKey, onPeriod }: SectionProps) {
	const { data, error, loading } = useAnalyticsData(
		"funnel",
		params,
		reloadKey,
	);
	usePeriodReport(data?.period, onPeriod);
	return (
		<Frame loading={loading} error={error} hasData={Boolean(data)}>
			{data && <Funnel data={data} />}
		</Frame>
	);
}

function Funnel({ data }: { data: FunnelDTO }) {
	const { stages, void: voided, openNow, carts, historyCoverage } = data;
	const totalLost = voided.cancelled + voided.refunded;
	const completion = data.placed > 0 ? stages[4].reached / data.placed : null;
	const hasTiming = data.stageTiming.some((row) => row.sample > 0);
	const historyShare =
		historyCoverage.total > 0
			? historyCoverage.withTransitions / historyCoverage.total
			: null;

	return (
		<div className={styles.grid12}>
			<Note title="Что показывает воронка">
				Этапы обработки уже оформленных заказов. Этапов «просмотр → корзина →
				оформление» здесь нет: эти события копит Яндекс.Метрика, а в базе их
				истории нет. Этап отмены известен только из истории статусов, которая
				заполнена у {pct(historyShare, 0)} заказов периода: смена статуса из
				админки туда не пишется, поэтому для отмен это последний зафиксированный
				этап, реальный мог быть позже.
			</Note>

			<div className={styles.tiles}>
				<StatTile
					label="Оформлено"
					value={int(data.placed)}
					sub={moneyCompact(stages[0].reachedAmount)}
				/>
				<StatTile
					label="Дошло до покупателя"
					value={pct(completion)}
					hint="Заказы периода, получившие статус «Доставлен». Свежие заказы могут быть ещё в пути."
					sub={`${int(stages[4].reached)} из ${int(data.placed)}`}
				/>
				<StatTile
					label="Больше всего потерь"
					value={data.biggestLossStage ?? "—"}
					hint="Этап, на котором зафиксировано больше всего отмен и возвратов. Этап берётся из истории статусов и может быть раньше настоящего: смена статуса из админки туда не пишется."
					sub={
						totalLost > 0
							? `потеряно ${int(totalLost)} · по истории статусов`
							: "отмен и возвратов нет"
					}
				/>
				<StatTile
					label="Самая большая очередь"
					value={data.biggestQueueStage ?? "—"}
					hint="Этап, на котором сейчас стоит больше всего заказов этого периода."
				/>
			</div>

			<Card title="Этапы заказа" span={5}>
				<FunnelBars
					stages={stages.map((stage) => ({
						key: stage.key,
						label: stage.label,
						reached: stage.reached,
						conversion: stage.conversionToNext,
					}))}
				/>
			</Card>
			<Card
				title="Переходы между этапами"
				hint="«Без незавершённых» убирает заказы, которые ещё стоят на этапе: свежие заказы не выглядят потерянными."
				span={7}
			>
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Этап</th>
								<th className={styles.num}>Достигли</th>
								<th className={styles.num}>Стоят сейчас</th>
								<th className={styles.num}>Потеряно</th>
								<th className={styles.num}>Дальше</th>
								<th className={styles.num}>Без незавершённых</th>
							</tr>
						</thead>
						<tbody>
							{stages.map((stage) => (
								<tr key={stage.key}>
									<td>{stage.label}</td>
									<td className={styles.num}>{int(stage.reached)}</td>
									<td className={styles.num}>{int(stage.active)}</td>
									<td className={styles.num}>
										{int(stage.lost)}
										{stage.lostAmount > 0 && (
											<span className={styles.cellSub}>
												{moneyCompact(stage.lostAmount)}
											</span>
										)}
									</td>
									<td className={styles.num}>{pct(stage.conversionToNext)}</td>
									<td className={styles.num}>
										{pct(stage.closedConversionToNext)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Card>

			<Card
				title="Отмены и возвраты"
				hint={
					voided.previousRate !== null ? (
						<>
							Доля от оформленных: {pct(voided.rate)}.{" "}
							<Delta
								current={voided.rate}
								previous={voided.previousRate}
								mode="points"
								inverse
							/>
						</>
					) : (
						`Доля от оформленных: ${pct(voided.rate)}.`
					)
				}
				span={6}
			>
				<dl className={styles.kv}>
					<div className={styles.kvRow}>
						<dt>Отменено</dt>
						<dd>
							{int(voided.cancelled)}{" "}
							<span className={styles.muted}>
								{money(voided.cancelledAmount)}
							</span>
						</dd>
					</div>
					<div className={styles.kvRow}>
						<dt>Возвращено</dt>
						<dd>
							{int(voided.refunded)}{" "}
							<span className={styles.muted}>
								{money(voided.refundedAmount)}
							</span>
						</dd>
					</div>
				</dl>
				<h3 className={styles.subTitle}>Причины отмены</h3>
				{voided.reasons.length ? (
					<BarList
						rows={voided.reasons.map((row) => ({
							key: row.reason,
							label: row.reason,
							value: row.orders,
							valueText: int(row.orders),
						}))}
					/>
				) : (
					<p className={styles.empty}>
						Причины за период не указаны: их записывает только покупатель, когда
						отменяет заказ сам
					</p>
				)}
			</Card>

			<Card
				title="Где отменяют чаще"
				hint="Доля отмен и возвратов среди оформленных заказов каждого среза."
				span={6}
			>
				{(["delivery", "payment", "customerType"] as const).map((dimension) => {
					const rows = voided.slices.filter((s) => s.dimension === dimension);
					if (!rows.length) return null;
					return (
						<div key={dimension}>
							<h3 className={styles.subTitle}>{SLICE_TITLES[dimension]}</h3>
							<BarList
								max={1}
								rows={rows.map((row) => ({
									key: row.key,
									label: sliceLabel(row),
									value: row.rate ?? 0,
									valueText: pct(row.rate, 0),
									aside: `${int(row.voided)} из ${int(row.placed)}`,
								}))}
							/>
						</div>
					);
				})}
			</Card>

			<Card
				title="Оплата"
				hint="Действующие заказы периода. Статус оплаты и счёт отмечает менеджер, поэтому показатель настолько точен, насколько их ведут."
				span={12}
			>
				{data.payment.length ? (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Способ</th>
									<th className={styles.num}>Заказы</th>
									<th className={styles.num}>Счёт приложен</th>
									<th className={styles.num}>Оплачено</th>
									<th className={styles.num}>Доля оплаченных</th>
									<th className={styles.num}>Медиана до оплаты</th>
								</tr>
							</thead>
							<tbody>
								{data.payment.map((row) => (
									<tr key={row.method}>
										<td>
											{PAYMENT_LABELS[
												row.method as keyof typeof PAYMENT_LABELS
											] ?? row.method}
										</td>
										<td className={styles.num}>{int(row.orders)}</td>
										<td className={styles.num}>
											{row.method === "invoice"
												? int(row.invoiceAttached)
												: "—"}
										</td>
										<td className={styles.num}>{int(row.paid)}</td>
										<td className={styles.num}>{pct(row.paidRate, 0)}</td>
										<td className={styles.num}>
											{row.medianDaysToPay === null
												? "—"
												: `${dec(row.medianDaysToPay)} дн.`}
											{row.daysToPaySample > 0 && (
												<span className={styles.cellSub}>
													по {int(row.daysToPaySample)}
												</span>
											)}
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

			<Card
				title={`Незавершённые заказы сейчас: ${int(openNow.total)}`}
				hint={`На ${money(openNow.amount)}. Снимок на текущий момент: зависшие заказы видны независимо от выбранного периода, фильтры применяются.`}
				span={5}
			>
				<BarList
					empty="Незавершённых заказов нет"
					rows={openNow.aging.map((row) => ({
						key: row.key,
						label: AGE_LABELS[row.key] ?? row.key,
						value: row.orders,
						valueText: int(row.orders),
						aside: moneyCompact(row.amount),
					}))}
				/>
			</Card>
			<Card title="Самые старые незавершённые" span={7}>
				{openNow.oldest.length ? (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Заказ</th>
									<th>Статус</th>
									<th className={styles.num}>Возраст</th>
									<th className={styles.num}>Сумма</th>
								</tr>
							</thead>
							<tbody>
								{openNow.oldest.map((row) => (
									<tr key={row.id}>
										<td>
											<a href={`/admin/collections/orders/${row.id}`}>
												{row.orderNumber}
											</a>
										</td>
										<td>{ORDER_STATUS_LABELS[row.status]}</td>
										<td className={styles.num}>{int(row.ageDays)} дн.</td>
										<td className={styles.num}>{money(row.total)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className={styles.empty}>Незавершённых заказов нет</p>
				)}
			</Card>

			<Card
				title={`Корзины с товарами сейчас: ${int(carts.nonEmpty)}`}
				hint={`${int(carts.units)} единиц. Снимок, а не этап воронки: истории корзин нет, поэтому конверсию корзины в заказ посчитать нельзя. Сумму не показываем: цены и скидки изменятся к моменту оформления.`}
				span={5}
			>
				<BarList
					empty="Корзин с товарами нет"
					rows={carts.aging.map((row) => ({
						key: row.key,
						label: AGE_LABELS[row.key] ?? row.key,
						value: row.carts,
						valueText: int(row.carts),
					}))}
				/>
			</Card>
			<Card
				title="Сколько идут этапы"
				hint="Медиана от оформления до первого достижения этапа, по истории статусов."
				span={7}
			>
				{hasTiming ? (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Этап</th>
									<th className={styles.num}>От оформления</th>
									<th className={styles.num}>Заказов в расчёте</th>
								</tr>
							</thead>
							<tbody>
								{data.stageTiming.map((row) => (
									<tr key={row.key}>
										<td>{row.label}</td>
										<td className={styles.num}>
											{hoursLabel(row.medianHours)}
										</td>
										<td className={styles.num}>{int(row.sample)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className={styles.empty}>
						Нет данных: смена статуса из админки не записывается в историю, а
						другого источника времени этапов нет
					</p>
				)}
			</Card>
		</div>
	);
}
