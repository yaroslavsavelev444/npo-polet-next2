"use client";

import { useEffect, useState } from "react";
import {
	CANNED_UNDERUSED_MIN_SUGGESTIONS,
	SUPPORT_TOPICS,
} from "../../lib/constants";
import type { SupportReportDTO } from "../../server/reports";
import type { SupportLiveDTO } from "../../server/support.service";
import styles from "./reports.module.css";

const PERIODS = [
	{ days: 7, label: "7 дней" },
	{ days: 30, label: "30 дней" },
	{ days: 90, label: "90 дней" },
	{ days: 365, label: "Год" },
] as const;
const LIVE_POLL_MS = 30_000;
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
	SUPPORT_TOPICS.map((t) => [t.value, t.label]),
);
const STATUS_LABEL = {
	available: "на месте",
	away: "отошёл",
	offline: "не в сети",
} as const;

function duration(minutes: number | null): string {
	if (minutes === null) return "—";
	if (minutes < 1) return "< 1 мин";
	if (minutes < 60) return `${Math.round(minutes)} мин`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		const rest = Math.round(minutes - hours * 60);
		return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
	}
	const days = Math.floor(hours / 24);
	const restHours = hours - days * 24;
	return restHours ? `${days} д ${restHours} ч` : `${days} д`;
}

function shortDate(key: string): string {
	const [, month, day] = key.split("-");
	return `${Number(day)}.${month}`;
}

async function getJson<T>(url: string): Promise<T> {
	const response = await fetch(url, {
		credentials: "same-origin",
		cache: "no-store",
	});
	if (!response.ok) {
		const data = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		throw new Error(data?.error?.message ?? `Ошибка ${response.status}`);
	}
	return (await response.json()) as T;
}

/**
 * Отчёты чата поддержки: живая панель (опрос раз в 30 с, пока вкладка на
 * виду) и отчёт за выбранный период. Графики — простые одноцветные полосы и
 * тепловая карта без библиотеки: серий по одной, легенда не нужна, значения
 * подписаны в подсказке и таблицей под картой.
 */
export function SupportReports() {
	const [days, setDays] = useState<number>(30);
	const [report, setReport] = useState<SupportReportDTO | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [live, setLive] = useState<SupportLiveDTO | null>(null);

	useEffect(() => {
		let cancelled = false;
		setError(null);
		getJson<SupportReportDTO>(`/api/support/staff/reports?days=${days}`)
			.then((data) => !cancelled && setReport(data))
			.catch((e: Error) => !cancelled && setError(e.message));
		return () => {
			cancelled = true;
		};
	}, [days]);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			if (document.hidden) return;
			try {
				const data = await getJson<SupportLiveDTO>("/api/support/staff/live");
				if (!cancelled) setLive(data);
			} catch {
				// Живая панель — удобство; сбой сети не должен ломать отчёт.
			}
		};
		void load();
		const timer = window.setInterval(load, LIVE_POLL_MS);
		document.addEventListener("visibilitychange", load);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", load);
		};
	}, []);

	return (
		<div className={styles.page}>
			<div className={styles.topBar}>
				<h1 className={styles.heading}>Отчёты чата</h1>
				<a href="/admin/support" className={styles.back}>
					← Консоль
				</a>
				<div className={styles.periods} role="group" aria-label="Период">
					{PERIODS.map((p) => (
						<button
							key={p.days}
							type="button"
							aria-pressed={days === p.days}
							className={days === p.days ? styles.periodOn : styles.period}
							onClick={() => setDays(p.days)}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			{live && <LivePanel live={live} />}

			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{!report && !error && <p className={styles.muted}>Загрузка…</p>}
			{report && <Report report={report} />}
		</div>
	);
}

function LivePanel({ live }: { live: SupportLiveDTO }) {
	const overdue = live.overdue > 0;
	return (
		<section className={styles.card} aria-label="Сейчас">
			<h2 className={styles.cardTitle}>
				Сейчас{" "}
				<span className={styles.muted}>
					·{" "}
					{live.open
						? `рабочее время, срок ${live.slaMinutes} мин`
						: "нерабочее время"}
				</span>
			</h2>
			<div className={styles.tiles}>
				<Tile label="В очереди без менеджера" value={live.queue} />
				<Tile label="Ждут ответа" value={live.awaiting} />
				<Tile
					label="Ждут дольше срока"
					value={live.overdue}
					tone={overdue ? "bad" : undefined}
				/>
				<Tile
					label="Самое долгое ожидание"
					value={duration(live.longestWaitMinutes)}
					tone={overdue ? "bad" : undefined}
				/>
			</div>
			<ul className={styles.agents}>
				{live.agents.map((agent) => (
					<li key={agent.adminId}>
						<span
							className={`${styles.dot} ${styles[`dot_${agent.status}`]}`}
							aria-hidden
						/>
						{agent.name}{" "}
						<span className={styles.muted}>
							— {STATUS_LABEL[agent.status]}, открытых: {agent.openCount}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function Tile({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string | number;
	hint?: string;
	tone?: "bad";
}) {
	return (
		<div className={styles.tile}>
			<span className={styles.tileLabel}>{label}</span>
			<span
				className={`${styles.tileValue} ${tone === "bad" ? styles.bad : ""}`}
			>
				{value}
			</span>
			{hint && <span className={styles.tileHint}>{hint}</span>}
		</div>
	);
}

function Report({ report }: { report: SupportReportDTO }) {
	const { totals, firstResponse: fr, resolution, csat } = report;
	const breachShare = fr.slaSample
		? Math.round((fr.slaBreaches / fr.slaSample) * 100)
		: null;

	return (
		<>
			<section className={styles.card} aria-label="Итоги периода">
				<div className={styles.tiles}>
					<Tile
						label="Диалогов"
						value={totals.conversations}
						hint={`закрыто ${totals.resolved}, переоткрыто ${totals.reopened}`}
					/>
					<Tile
						label="Сообщений"
						value={totals.customerMessages}
						hint={`ответов менеджеров ${totals.staffMessages}`}
					/>
					<Tile
						label="Первый ответ, медиана"
						value={duration(fr.medianMinutes)}
						hint={`90% — быстрее ${duration(fr.p90Minutes)} · ${fr.sample} диалогов`}
					/>
					<Tile
						label="Позже срока"
						value={breachShare === null ? "—" : `${breachShare}%`}
						hint={`${fr.slaBreaches} из ${fr.slaSample} в рабочее время`}
						tone={breachShare !== null && breachShare > 10 ? "bad" : undefined}
					/>
					<Tile
						label="Решение, медиана"
						value={duration(resolution.medianMinutes)}
						hint={`90% — быстрее ${duration(resolution.p90Minutes)}`}
					/>
					<Tile
						label="Оценка"
						value={csat.average === null ? "—" : `${csat.average} из 5`}
						hint={`оценок: ${csat.count}`}
					/>
				</div>
			</section>

			<div className={styles.grid}>
				<section className={`${styles.card} ${styles.wide}`}>
					<h2 className={styles.cardTitle}>Новые диалоги по дням</h2>
					<DailyBars daily={report.daily} />
				</section>

				<section className={`${styles.card} ${styles.wide}`}>
					<h2 className={styles.cardTitle}>
						Когда пишут покупатели{" "}
						<span className={styles.muted}>
							· сообщения по часам, {report.period.timezone}
						</span>
					</h2>
					<Heatmap heatmap={report.heatmap} />
				</section>

				<section className={styles.card}>
					<h2 className={styles.cardTitle}>Оценки</h2>
					<RankedBars
						rows={[5, 4, 3, 2, 1].map((score) => ({
							key: String(score),
							label: `${score} ★`,
							value: csat.distribution[score - 1],
						}))}
						empty="Оценок за период нет"
					/>
				</section>

				<section className={styles.card}>
					<h2 className={styles.cardTitle}>Темы</h2>
					<RankedBars
						rows={report.topics.map((t) => ({
							key: t.topic,
							label: TOPIC_LABEL[t.topic] ?? t.topic,
							value: t.count,
						}))}
						empty="Диалогов за период нет"
					/>
				</section>

				<section className={styles.card}>
					<h2 className={styles.cardTitle}>Метки</h2>
					<RankedBars
						rows={report.tags.map((t) => ({
							key: t.tag,
							label: t.tag,
							value: t.count,
						}))}
						empty="Меток за период нет"
					/>
				</section>

				<section className={styles.card}>
					<h2 className={styles.cardTitle}>Заготовки</h2>
					<RankedBars
						rows={report.canned.map((c) => ({
							key: String(c.id),
							label: c.title,
							value: c.uses,
						}))}
						empty="Заготовками не пользовались"
					/>
				</section>

				<section className={`${styles.card} ${styles.wide}`}>
					<h2 className={styles.cardTitle}>Менеджеры</h2>
					{report.agents.length === 0 ? (
						<p className={styles.muted}>Назначенных диалогов за период нет</p>
					) : (
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th scope="col">Менеджер</th>
										<th scope="col">Диалогов</th>
										<th scope="col">Ответов</th>
										<th scope="col">Первый ответ, медиана</th>
										<th scope="col">Оценка</th>
									</tr>
								</thead>
								<tbody>
									{report.agents.map((agent) => (
										<tr key={agent.adminId}>
											<th scope="row">{agent.name}</th>
											<td>{agent.conversations}</td>
											<td>{agent.messages}</td>
											<td>{duration(agent.medianFirstResponseMinutes)}</td>
											<td>
												{agent.csatAverage === null
													? "—"
													: `${agent.csatAverage} (${agent.csatCount})`}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>

				<section className={`${styles.card} ${styles.wide}`}>
					<h2 className={styles.cardTitle}>
						Подсказываются, но не используются
					</h2>
					<p className={styles.muted}>
						Общие заготовки, которые консоль подсказывала хотя бы{" "}
						{CANNED_UNDERUSED_MIN_SUGGESTIONS} раз, а вставляли реже, чем в
						каждом пятом случае. За всё время, а не за период. Обычно это
						слишком широкие фразы-триггеры или устаревший текст.
					</p>
					{report.cannedUnderused.length === 0 ? (
						<p className={styles.muted}>Таких заготовок нет</p>
					) : (
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th scope="col">Заготовка</th>
										<th scope="col">Подсказана</th>
										<th scope="col">Вставлена</th>
										<th scope="col">Доля</th>
										<th scope="col">Последний раз</th>
									</tr>
								</thead>
								<tbody>
									{report.cannedUnderused.map((c) => (
										<tr key={c.id}>
											<th scope="row">
												<a
													href={`/admin/collections/support-canned-responses/${c.id}`}
												>
													{c.title}
												</a>
											</th>
											<td>{c.suggested}</td>
											<td>{c.used}</td>
											<td>{Math.round(c.ratio * 100)} %</td>
											<td>
												{c.lastUsedAt
													? new Date(c.lastUsedAt).toLocaleDateString("ru-RU")
													: "никогда"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>
		</>
	);
}

function DailyBars({ daily }: { daily: SupportReportDTO["daily"] }) {
	const max = Math.max(1, ...daily.map((d) => d.conversations));
	// Подписи оси — не на каждом столбце: при 90+ днях они слились бы.
	const step = Math.ceil(daily.length / 10);
	return (
		<>
			<div
				className={styles.bars}
				role="img"
				aria-label="Новые диалоги по дням"
			>
				{daily.map((d, index) => (
					<div
						key={d.date}
						className={styles.barCol}
						title={`${shortDate(d.date)}: диалогов ${d.conversations}, сообщений ${d.customerMessages}`}
					>
						<div
							className={styles.bar}
							style={{ height: `${(d.conversations / max) * 100}%` }}
						/>
						<span className={styles.barLabel}>
							{index % step === 0 ? shortDate(d.date) : ""}
						</span>
					</div>
				))}
			</div>
			<p className={styles.axisNote}>Максимум за день: {max}</p>
		</>
	);
}

function Heatmap({ heatmap }: { heatmap: number[][] }) {
	const max = Math.max(1, ...heatmap.flat());
	return (
		<>
			<div className={styles.heatScroll}>
				<table className={styles.heat}>
					<thead>
						<tr>
							<th />
							{Array.from({ length: 24 }, (_, hour) => (
								<th key={hour} scope="col">
									{hour % 3 === 0 ? hour : ""}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{heatmap.map((row, day) => (
							<tr key={WEEKDAYS[day]}>
								<th scope="row">{WEEKDAYS[day]}</th>
								{row.map((value, hour) => (
									<td
										key={hour}
										title={`${WEEKDAYS[day]}, ${hour}:00–${hour + 1}:00 — ${value}`}
										aria-label={`${WEEKDAYS[day]}, ${hour} ч: ${value}`}
										style={{
											background: value
												? `color-mix(in oklab, var(--theme-success-500) ${Math.round(15 + (value / max) * 85)}%, var(--theme-elevation-0))`
												: undefined,
										}}
									/>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className={styles.axisNote}>
				Чем насыщеннее клетка, тем больше сообщений (самая яркая — {max} за час
				периода); точное число — в подсказке. Помогает планировать смены.
			</p>
		</>
	);
}

function RankedBars({
	rows,
	empty,
}: {
	rows: { key: string; label: string; value: number }[];
	empty: string;
}) {
	const max = Math.max(0, ...rows.map((r) => r.value));
	if (max === 0) return <p className={styles.muted}>{empty}</p>;
	return (
		<ul className={styles.ranked}>
			{rows.map((row) => (
				<li key={row.key}>
					<span className={styles.rankedLabel}>{row.label}</span>
					<span className={styles.rankedTrack}>
						<span
							className={styles.rankedBar}
							style={{ width: `${(row.value / max) * 100}%` }}
						/>
					</span>
					<span className={styles.rankedValue}>{row.value}</span>
				</li>
			))}
		</ul>
	);
}
