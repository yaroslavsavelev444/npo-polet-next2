"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import styles from "./analytics.module.css";
import { axisNumber, int, pct } from "./format";

/**
 * Графики страницы — на SVG и CSS, без библиотеки: как и отчёты чата, они не
 * добавляют вес бандлу админки, а нужны здесь только несколько простых форм.
 * Цвета — переменные темы из analytics.module.css: светлая и тёмная темы
 * Payload работают без отдельного кода.
 */

// ─── Подсказка ───────────────────────────────────────────────────────────────

interface TipState {
	x: number;
	y: number;
	content: ReactNode;
}

const TipContext = createContext<(tip: TipState | null) => void>(() => {});

export function TipProvider({ children }: { children: ReactNode }) {
	const [tip, setTip] = useState<TipState | null>(null);
	return (
		<TipContext.Provider value={setTip}>
			{children}
			{tip && (
				<div
					className={styles.tip}
					role="status"
					style={{
						left: Math.min(tip.x + 14, window.innerWidth - 280),
						top: Math.max(8, tip.y - 12),
					}}
				>
					{tip.content}
				</div>
			)}
		</TipContext.Provider>
	);
}

/** Подсказка на отметке: мышь и клавиатура получают одно и то же. */
export function useTip(content: () => ReactNode) {
	const setTip = useContext(TipContext);
	return {
		onPointerMove: (event: React.PointerEvent) =>
			setTip({ x: event.clientX, y: event.clientY, content: content() }),
		onPointerLeave: () => setTip(null),
		onFocus: (event: React.FocusEvent<Element>) => {
			const box = event.currentTarget.getBoundingClientRect();
			setTip({ x: box.right, y: box.top, content: content() });
		},
		onBlur: () => setTip(null),
	};
}

export function TipRow({
	value,
	label,
	keyClass,
}: {
	value: string;
	label: string;
	keyClass?: string;
}) {
	return (
		<div className={styles.tipRow}>
			{keyClass && <span className={keyClass} aria-hidden />}
			<strong>{value}</strong>
			<span>{label}</span>
		</div>
	);
}

// ─── Изменение к периоду сравнения ───────────────────────────────────────────

export function Delta({
	current,
	previous,
	mode = "percent",
	inverse = false,
}: {
	current: number | null;
	previous: number | null | undefined;
	/** points — для долей: разница в процентных пунктах, а не процент от процента. */
	mode?: "percent" | "points";
	/** Рост — плохо (доля отмен). */
	inverse?: boolean;
}) {
	if (previous === undefined || previous === null || current === null) {
		return null;
	}
	if (mode === "percent" && previous === 0) {
		// Рост с нуля — не «+∞%»: процента здесь не существует.
		return current === 0 ? (
			<span className={styles.deltaFlat}>без изменений</span>
		) : (
			<span className={styles.deltaFlat}>в прошлом периоде 0</span>
		);
	}
	const diff =
		mode === "percent" ? (current - previous) / previous : current - previous;
	if (Math.abs(diff) < 0.0005) {
		return <span className={styles.deltaFlat}>без изменений</span>;
	}
	const up = diff > 0;
	const good = inverse ? !up : up;
	const value =
		mode === "percent"
			? pct(Math.abs(diff))
			: `${(Math.abs(diff) * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} п.п.`;
	return (
		<span className={good ? styles.deltaGood : styles.deltaBad}>
			<span aria-hidden>{up ? "▲" : "▼"}</span>{" "}
			<span className={styles.srOnly}>{up ? "рост" : "снижение"}</span>
			{value}
		</span>
	);
}

// ─── Карточка показателя ─────────────────────────────────────────────────────

export function StatTile({
	label,
	value,
	title,
	sub,
	delta,
	hint,
}: {
	label: string;
	value: string;
	title?: string;
	sub?: ReactNode;
	delta?: ReactNode;
	hint?: string;
}) {
	return (
		<div className={styles.tile}>
			<div className={styles.tileLabel} title={hint}>
				{label}
				{hint && (
					<span className={styles.hintMark} aria-hidden>
						?
					</span>
				)}
				{hint && <span className={styles.srOnly}>{hint}</span>}
			</div>
			<div className={styles.tileValue} title={title}>
				{value}
			</div>
			{delta && <div className={styles.tileDelta}>{delta}</div>}
			{sub && <div className={styles.tileSub}>{sub}</div>}
		</div>
	);
}

// ─── Линейный график времени ─────────────────────────────────────────────────

export interface TimePoint {
	key: string;
	axisLabel: string;
	tipLabel: string;
	value: number | null;
	compare?: number | null;
	compareTipLabel?: string;
}

function niceMax(max: number): number {
	if (max <= 0) return 1;
	const exp = 10 ** Math.floor(Math.log10(max));
	const norm = max / exp;
	const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
	return step * exp;
}

const CHART_HEIGHT = 280;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 64 };

function useWidth() {
	const ref = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}

export function TimeChart({
	points,
	formatValue,
	seriesLabel,
	compareLabel,
}: {
	points: TimePoint[];
	formatValue: (value: number) => string;
	seriesLabel: string;
	compareLabel?: string;
}) {
	const { ref, width } = useWidth();
	const [hover, setHover] = useState<number | null>(null);
	const setTip = useContext(TipContext);
	const descriptionId = useId();
	const hasCompare = points.some((p) => p.compare !== undefined);

	const yMax = useMemo(() => {
		const values = points.flatMap((p) => [p.value ?? 0, p.compare ?? 0]);
		return niceMax(Math.max(0, ...values));
	}, [points]);

	const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
	const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
	const x = (index: number) =>
		MARGIN.left +
		(points.length > 1
			? (index / (points.length - 1)) * innerWidth
			: innerWidth / 2);
	const y = (value: number) =>
		MARGIN.top + innerHeight - (value / yMax) * innerHeight;

	const path = (pick: (p: TimePoint) => number | null | undefined) => {
		let d = "";
		let open = false;
		points.forEach((point, index) => {
			const value = pick(point);
			if (value === null || value === undefined) {
				open = false;
				return;
			}
			d += `${open ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
			open = true;
		});
		return d;
	};

	const main = path((p) => p.value);
	const area =
		points.length > 1 && points.every((p) => p.value !== null)
			? `${main}L${x(points.length - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`
			: "";

	const labelEvery = Math.max(
		1,
		Math.ceil(points.length / Math.max(2, Math.floor(innerWidth / 72))),
	);

	const showTip = useCallback(
		(index: number, clientX: number, clientY: number) => {
			const point = points[index];
			setHover(index);
			setTip({
				x: clientX,
				y: clientY,
				content: (
					<>
						<div className={styles.tipTitle}>{point.tipLabel}</div>
						<TipRow
							keyClass={styles.keyLine}
							value={point.value === null ? "—" : formatValue(point.value)}
							label={seriesLabel}
						/>
						{point.compare !== undefined && (
							<TipRow
								keyClass={styles.keyLineMuted}
								value={
									point.compare === null ? "—" : formatValue(point.compare)
								}
								label={point.compareTipLabel ?? compareLabel ?? ""}
							/>
						)}
					</>
				),
			});
		},
		[points, formatValue, seriesLabel, compareLabel, setTip],
	);

	const indexAt = (clientX: number, rect: DOMRect) => {
		const position = clientX - rect.left - MARGIN.left;
		if (points.length < 2) return 0;
		const raw = Math.round((position / innerWidth) * (points.length - 1));
		return Math.min(points.length - 1, Math.max(0, raw));
	};

	return (
		<div>
			{hasCompare && (
				<div className={styles.legend}>
					<span className={styles.legendItem}>
						<span className={styles.keyLine} aria-hidden />
						{seriesLabel}
					</span>
					<span className={styles.legendItem}>
						<span className={styles.keyLineMuted} aria-hidden />
						{compareLabel}
					</span>
				</div>
			)}
			<div ref={ref} className={styles.chartBox}>
				{width > 0 && (
					<svg
						width={width}
						height={CHART_HEIGHT}
						role="group"
						aria-describedby={descriptionId}
						tabIndex={0}
						className={styles.chartSvg}
						onPointerMove={(event) =>
							showTip(
								indexAt(
									event.clientX,
									event.currentTarget.getBoundingClientRect(),
								),
								event.clientX,
								event.clientY,
							)
						}
						onPointerLeave={() => {
							setHover(null);
							setTip(null);
						}}
						onBlur={() => {
							setHover(null);
							setTip(null);
						}}
						onKeyDown={(event) => {
							if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
								return;
							}
							event.preventDefault();
							const step = event.key === "ArrowRight" ? 1 : -1;
							const next = Math.min(
								points.length - 1,
								Math.max(0, (hover ?? -step) + step),
							);
							const box = event.currentTarget.getBoundingClientRect();
							showTip(next, box.left + x(next), box.top + 40);
						}}
					>
						<desc id={descriptionId}>
							{`${seriesLabel}: график из ${points.length} точек. Стрелки влево и вправо переключают точку. Значения есть в таблице под графиком.`}
						</desc>
						{[0, 0.25, 0.5, 0.75, 1].map((share) => {
							const value = yMax * share;
							return (
								<g key={share}>
									<line
										x1={MARGIN.left}
										x2={width - MARGIN.right}
										y1={y(value)}
										y2={y(value)}
										className={styles.grid}
									/>
									<text
										x={MARGIN.left - 8}
										y={y(value) + 4}
										textAnchor="end"
										className={styles.axisText}
									>
										{axisNumber(value)}
									</text>
								</g>
							);
						})}
						{points.map((point, index) =>
							index % labelEvery === 0 ? (
								<text
									key={point.key}
									x={x(index)}
									y={CHART_HEIGHT - 8}
									textAnchor={
										index === 0 && points.length > 1 ? "start" : "middle"
									}
									className={styles.axisText}
								>
									{point.axisLabel}
								</text>
							) : null,
						)}
						{hasCompare && (
							<path d={path((p) => p.compare)} className={styles.lineMuted} />
						)}
						{area && <path d={area} className={styles.areaWash} />}
						<path d={main} className={styles.lineMain} />
						{points.length === 1 && points[0].value !== null && (
							<circle
								cx={x(0)}
								cy={y(points[0].value)}
								r={5}
								className={styles.dot}
							/>
						)}
						{hover !== null && (
							<>
								<line
									x1={x(hover)}
									x2={x(hover)}
									y1={MARGIN.top}
									y2={MARGIN.top + innerHeight}
									className={styles.crosshair}
								/>
								{points[hover].value !== null && (
									<circle
										cx={x(hover)}
										cy={y(points[hover].value as number)}
										r={5}
										className={styles.dot}
									/>
								)}
							</>
						)}
					</svg>
				)}
			</div>
		</div>
	);
}

// ─── Столбики с накоплением ──────────────────────────────────────────────────

export function StackedColumns({
	points,
	series,
}: {
	points: { key: string; label: string; tip: string; values: number[] }[];
	series: { label: string; className: string; keyClass: string }[];
}) {
	const { ref, width } = useWidth();
	const height = 220;
	const margin = { top: 8, right: 8, bottom: 26, left: 44 };
	const innerHeight = height - margin.top - margin.bottom;
	const innerWidth = Math.max(0, width - margin.left - margin.right);
	const yMax = niceMax(
		Math.max(0, ...points.map((p) => p.values.reduce((s, v) => s + v, 0))),
	);
	const band = points.length ? innerWidth / points.length : 0;
	const barWidth = Math.max(2, Math.min(24, band - 2));
	const labelEvery = Math.max(1, Math.ceil(points.length / (innerWidth / 64)));

	return (
		<div>
			<div className={styles.legend}>
				{series.map((s) => (
					<span key={s.label} className={styles.legendItem}>
						<span className={s.keyClass} aria-hidden />
						{s.label}
					</span>
				))}
			</div>
			<div ref={ref} className={styles.chartBox}>
				{width > 0 && (
					<svg
						width={width}
						height={height}
						role="img"
						aria-label={series.map((s) => s.label).join(" и ")}
					>
						{[0, 0.5, 1].map((share) => {
							const yPos = margin.top + innerHeight * (1 - share);
							return (
								<g key={share}>
									<line
										x1={margin.left}
										x2={width - margin.right}
										y1={yPos}
										y2={yPos}
										className={styles.grid}
									/>
									<text
										x={margin.left - 6}
										y={yPos + 4}
										textAnchor="end"
										className={styles.axisText}
									>
										{axisNumber(yMax * share)}
									</text>
								</g>
							);
						})}
						{points.map((point, index) => (
							<StackedBar
								key={point.key}
								point={point}
								series={series}
								x={margin.left + band * index + (band - barWidth) / 2}
								hitX={margin.left + band * index}
								hitWidth={band}
								top={margin.top}
								barWidth={barWidth}
								innerHeight={innerHeight}
								yMax={yMax}
							/>
						))}
						{points.map((point, index) =>
							index % labelEvery === 0 ? (
								<text
									key={point.key}
									x={margin.left + band * index + band / 2}
									y={height - 8}
									textAnchor="middle"
									className={styles.axisText}
								>
									{point.label}
								</text>
							) : null,
						)}
					</svg>
				)}
			</div>
		</div>
	);
}

function StackedBar({
	point,
	series,
	x,
	hitX,
	hitWidth,
	top,
	barWidth,
	innerHeight,
	yMax,
}: {
	point: { tip: string; values: number[] };
	series: { label: string; className: string; keyClass: string }[];
	x: number;
	hitX: number;
	hitWidth: number;
	top: number;
	barWidth: number;
	innerHeight: number;
	yMax: number;
}) {
	const tip = useTip(() => (
		<>
			<div className={styles.tipTitle}>{point.tip}</div>
			{series.map((s, index) => (
				<TipRow
					key={s.label}
					keyClass={s.keyClass}
					value={int(point.values[index])}
					label={s.label}
				/>
			))}
		</>
	));
	let cursor = top + innerHeight;
	return (
		<g {...tip}>
			<rect
				x={hitX}
				y={top}
				width={hitWidth}
				height={innerHeight}
				fill="transparent"
			/>
			{point.values.map((value, index) => {
				const segment = (value / yMax) * innerHeight;
				if (segment <= 0) return null;
				cursor -= segment;
				return (
					<rect
						key={series[index].label}
						x={x}
						y={cursor}
						width={barWidth}
						height={Math.max(1, segment - (index > 0 ? 2 : 0))}
						rx={index === point.values.length - 1 ? 3 : 0}
						className={series[index].className}
					/>
				);
			})}
		</g>
	);
}

// ─── Рейтинг полосами ────────────────────────────────────────────────────────

export interface BarRow {
	key: string;
	label: string;
	sub?: string;
	value: number;
	valueText: string;
	aside?: ReactNode;
	tip?: ReactNode;
	onSelect?: () => void;
	selected?: boolean;
	href?: string;
}

export function BarList({
	rows,
	max,
	empty = "Нет данных за период",
}: {
	rows: BarRow[];
	max?: number;
	empty?: string;
}) {
	if (!rows.length) return <p className={styles.empty}>{empty}</p>;
	const top = max ?? Math.max(...rows.map((row) => row.value), 0);
	return (
		<ul className={styles.barList}>
			{rows.map((row) => (
				<BarItem key={row.key} row={row} top={top} />
			))}
		</ul>
	);
}

function BarItem({ row, top }: { row: BarRow; top: number }) {
	const tip = useTip(
		() => row.tip ?? <TipRow value={row.valueText} label={row.label} />,
	);
	const width =
		top > 0 ? Math.max(row.value > 0 ? 1 : 0, (row.value / top) * 100) : 0;
	const label = (
		<span className={styles.barLabel} title={row.label}>
			<span className={styles.barName}>{row.label}</span>
			{row.sub && <span className={styles.barSub}>{row.sub}</span>}
		</span>
	);
	return (
		<li
			className={row.selected ? styles.barRowSelected : styles.barRow}
			{...(row.onSelect || row.href ? {} : tip)}
		>
			{row.onSelect ? (
				<button
					type="button"
					className={styles.barLabelButton}
					onClick={row.onSelect}
					aria-pressed={row.selected}
					{...tip}
				>
					{label}
				</button>
			) : row.href ? (
				<a className={styles.barLabelLink} href={row.href} {...tip}>
					{label}
				</a>
			) : (
				label
			)}
			<span className={styles.barTrack} aria-hidden>
				<span className={styles.barFill} style={{ width: `${width}%` }} />
			</span>
			<span className={styles.barValue}>{row.valueText}</span>
			{row.aside !== undefined && (
				<span className={styles.barAside}>{row.aside}</span>
			)}
		</li>
	);
}

// ─── Сегментированная полоса: одно целое на части ────────────────────────────

export function SegmentBar({
	parts,
}: {
	parts: { key: string; label: string; value: number; valueText: string }[];
}) {
	const total = parts.reduce((sum, part) => sum + part.value, 0);
	if (total <= 0) return <p className={styles.empty}>Нет данных за период</p>;
	return (
		<div>
			<div
				className={styles.segmentBar}
				role="img"
				aria-label={parts
					.map((p) => `${p.label}: ${p.valueText}, ${pct(p.value / total)}`)
					.join("; ")}
			>
				{parts.map((part, index) =>
					part.value > 0 ? (
						<Segment
							key={part.key}
							index={index}
							label={part.label}
							valueText={part.valueText}
							share={part.value / total}
						/>
					) : null,
				)}
			</div>
			<div className={styles.legend}>
				{parts.map((part, index) => (
					<span key={part.key} className={styles.legendItem}>
						<span
							className={styles.keyBox}
							style={{ background: `var(--series-${index + 1})` }}
							aria-hidden
						/>
						{part.label}
					</span>
				))}
			</div>
		</div>
	);
}

function Segment({
	index,
	label,
	valueText,
	share,
}: {
	index: number;
	label: string;
	valueText: string;
	share: number;
}) {
	const tip = useTip(() => (
		<TipRow value={`${valueText} · ${pct(share)}`} label={label} />
	));
	return (
		<span
			className={styles.segment}
			style={{
				flexGrow: share,
				background: `var(--series-${index + 1})`,
				color: `var(--series-${index + 1}-ink)`,
			}}
			{...tip}
		>
			{share >= 0.09 ? pct(share, 0) : ""}
		</span>
	);
}

// ─── Тепловая карта ──────────────────────────────────────────────────────────

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function Heatmap({ grid }: { grid: number[][] }) {
	const max = Math.max(...grid.flat(), 0);
	if (max === 0) return <p className={styles.empty}>Нет данных за период</p>;
	return (
		<div className={styles.scrollX}>
			<div
				className={styles.heatmap}
				role="img"
				aria-label="Заказы по дням недели и часам"
			>
				<span />
				{Array.from({ length: 24 }, (_, hour) => (
					<span key={hour} className={styles.heatHour}>
						{hour % 3 === 0 ? hour : ""}
					</span>
				))}
				{grid.map((row, weekday) => (
					<HeatRow
						key={WEEKDAYS[weekday]}
						weekday={WEEKDAYS[weekday]}
						row={row}
						max={max}
					/>
				))}
			</div>
			<div className={styles.heatScale}>
				<span>0</span>
				<span className={styles.heatScaleBar} aria-hidden />
				<span>{int(max)}</span>
			</div>
		</div>
	);
}

function HeatRow({
	weekday,
	row,
	max,
}: {
	weekday: string;
	row: number[];
	max: number;
}) {
	return (
		<>
			<span className={styles.heatDay}>{weekday}</span>
			{row.map((value, hour) => (
				<HeatCell
					key={hour}
					weekday={weekday}
					hour={hour}
					value={value}
					max={max}
				/>
			))}
		</>
	);
}

function HeatCell({
	weekday,
	hour,
	value,
	max,
}: {
	weekday: string;
	hour: number;
	value: number;
	max: number;
}) {
	const tip = useTip(() => (
		<>
			<div className={styles.tipTitle}>
				{weekday}, {hour}:00–{hour}:59
			</div>
			<TipRow value={int(value)} label="заказов" />
		</>
	));
	return (
		<span
			className={styles.heatCell}
			style={
				value > 0
					? ({
							"--heat": `${Math.round(12 + (value / max) * 88)}%`,
						} as React.CSSProperties)
					: undefined
			}
			{...tip}
		/>
	);
}

// ─── Воронка ─────────────────────────────────────────────────────────────────

export function FunnelBars({
	stages,
}: {
	stages: {
		key: string;
		label: string;
		reached: number;
		conversion: number | null;
	}[];
}) {
	const top = stages[0]?.reached ?? 0;
	if (top === 0) return <p className={styles.empty}>Нет заказов за период</p>;
	return (
		<ol className={styles.funnel}>
			{stages.map((stage, index) => (
				<li key={stage.key} className={styles.funnelStage}>
					<div className={styles.funnelHead}>
						<span>{stage.label}</span>
						<span className={styles.funnelValue}>
							<strong>{int(stage.reached)}</strong>{" "}
							<span className={styles.muted}>
								{pct(stage.reached / top, 0)}
							</span>
						</span>
					</div>
					<div className={styles.funnelTrack} aria-hidden>
						<span
							className={styles.funnelFill}
							style={{ width: `${(stage.reached / top) * 100}%` }}
						/>
					</div>
					{index < stages.length - 1 && (
						<div className={styles.funnelStep}>
							↓ дальше прошли{" "}
							{stage.conversion === null ? "—" : pct(stage.conversion)}
						</div>
					)}
				</li>
			))}
		</ol>
	);
}

// ─── Ячейка удержания ────────────────────────────────────────────────────────

export function shade(value: number): React.CSSProperties {
	return { "--heat": `${Math.round(value * 100)}%` } as React.CSSProperties;
}
