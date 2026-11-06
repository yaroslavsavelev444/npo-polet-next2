"use client";

import { SetStepNav } from "@payloadcms/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ORDER_STATUS_LABELS } from "@/modules/orders/lib/status.groups";
import {
	COMPARE_MODES,
	CUSTOMER_TYPE_LABELS,
	CUSTOMER_TYPES,
	DELIVERY_LABELS,
	DELIVERY_METHODS,
	GRANULARITIES,
	ORDER_STATUSES,
	PAYMENT_LABELS,
	PAYMENT_METHODS,
	PAYMENT_STATUS_LABELS,
	PAYMENT_STATUSES,
	PERIODS,
	SOURCE_LABELS,
	SOURCES,
} from "../lib/constants";
import type { PeriodInfo } from "../lib/types";
import styles from "./analytics.module.css";
import { TipProvider } from "./charts";
import { rangeLabel } from "./format";
import { CustomersSection } from "./sections/CustomersSection";
import { FunnelSection } from "./sections/FunnelSection";
import { GeoSection } from "./sections/GeoSection";
import { OverviewSection } from "./sections/OverviewSection";
import { ProductsSection } from "./sections/ProductsSection";
import { clearAnalyticsCache, useAnalyticsData } from "./useAnalyticsData";

const TABS = [
	{ key: "overview", label: "Обзор" },
	{ key: "products", label: "Товары" },
	{ key: "geo", label: "География" },
	{ key: "customers", label: "Клиенты" },
	{ key: "funnel", label: "Воронка" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_OPTIONS = [
	{ value: "valid", label: "Действующие" },
	{ value: "open", label: "В работе" },
	{ value: "void", label: "Отменённые и возвраты" },
	...ORDER_STATUSES.map((value) => ({
		value,
		label: ORDER_STATUS_LABELS[value],
	})),
];

/** Параметры страницы, которые входят в запрос данных; остальное — про вид. */
const DATA_KEYS = [
	"period",
	"from",
	"to",
	"compare",
	"granularity",
	"status",
	"customerType",
	"delivery",
	"payment",
	"paymentStatus",
	"source",
	"category",
	"region",
] as const;

const FILTER_KEYS = [
	"status",
	"customerType",
	"delivery",
	"payment",
	"paymentStatus",
	"source",
	"category",
	"region",
] as const;

const TABLE_KEYS = ["page", "sort", "dir", "q"];

/**
 * Страница аналитики. Состояние — в адресной строке: отчётом можно поделиться
 * ссылкой, и он откроется с теми же фильтрами. history.replaceState, а не
 * router: смена фильтра не должна перерисовывать на сервере всю админку.
 */
export function OrderAnalytics() {
	const searchParams = useSearchParams();
	const [reloadKey, setReloadKey] = useState(0);

	const setParams = useCallback((changes: Record<string, string | null>) => {
		const next = new URLSearchParams(window.location.search);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === "") next.delete(key);
			else next.set(key, value);
		}
		// Любая смена отчёта возвращает таблицу на первую страницу.
		if (!Object.keys(changes).some((key) => TABLE_KEYS.includes(key))) {
			if (!("tab" in changes)) next.delete("page");
		}
		const query = next.toString();
		window.history.replaceState(
			null,
			"",
			query ? `?${query}` : window.location.pathname,
		);
	}, []);

	const get = (key: string) => searchParams.get(key) ?? "";
	const tab = (TABS.find((t) => t.key === get("tab"))?.key ??
		"overview") as TabKey;

	const dataParams = useMemo(() => {
		const out = new URLSearchParams();
		for (const key of DATA_KEYS) {
			const value = searchParams.get(key);
			if (value) out.set(key, value);
		}
		return out.toString();
	}, [searchParams]);

	const meta = useAnalyticsData("meta", "");

	const period = get("period") || "30d";
	const activeFilters = FILTER_KEYS.filter((key) => get(key));

	const filterLabel = (key: (typeof FILTER_KEYS)[number]): string => {
		const value = get(key);
		switch (key) {
			case "status":
				return (
					STATUS_OPTIONS.find((option) => option.value === value)?.label ??
					value
				);
			case "customerType":
				return (
					CUSTOMER_TYPE_LABELS[value as keyof typeof CUSTOMER_TYPE_LABELS] ??
					value
				);
			case "delivery":
				return DELIVERY_LABELS[value as keyof typeof DELIVERY_LABELS] ?? value;
			case "payment":
				return PAYMENT_LABELS[value as keyof typeof PAYMENT_LABELS] ?? value;
			case "paymentStatus":
				return (
					PAYMENT_STATUS_LABELS[value as keyof typeof PAYMENT_STATUS_LABELS] ??
					value
				);
			case "source":
				return SOURCE_LABELS[value as keyof typeof SOURCE_LABELS] ?? value;
			case "category":
				return (
					meta.data?.categories.find((c) => String(c.id) === value)?.label ??
					value
				);
			case "region":
				return meta.data?.regions.find((r) => r.key === value)?.label ?? value;
		}
	};

	const sectionProps = {
		params: dataParams,
		reloadKey,
		setParams,
		searchParams,
	};

	const [shownPeriod, setShownPeriod] = useState<PeriodInfo | null>(null);

	return (
		<TipProvider>
			<SetStepNav
				nav={[
					{ label: "Заказы", url: "/admin/collections/orders" },
					{ label: "Аналитика" },
				]}
			/>
			<div className={styles.root}>
				<header className={styles.header}>
					<div>
						<h1 className={styles.title}>Аналитика заказов</h1>
						<p className={styles.subtitle}>
							{shownPeriod
								? `${rangeLabel(shownPeriod.from, shownPeriod.to)}${
										shownPeriod.compare
											? ` · сравнение: ${rangeLabel(shownPeriod.compare.from, shownPeriod.compare.to)}`
											: ""
									} · время московское`
								: " "}
						</p>
					</div>
					<div className={styles.headerActions}>
						<button
							type="button"
							className={styles.ghostButton}
							onClick={() => {
								clearAnalyticsCache();
								setReloadKey((key) => key + 1);
							}}
						>
							Обновить
						</button>
						<Link
							href="/admin/collections/orders"
							className={styles.ghostButton}
						>
							← К заказам
						</Link>
					</div>
				</header>

				<section className={styles.filters} aria-label="Период и фильтры">
					<div className={styles.filterRow}>
						<Select
							label="Период"
							value={period}
							onChange={(value) =>
								setParams({
									period: value,
									...(value === "custom"
										? {
												from: get("from") || shownPeriod?.from || "",
												to: get("to") || shownPeriod?.to || "",
											}
										: { from: null, to: null }),
								})
							}
							options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
						/>
						{period === "custom" && (
							<>
								<DateInput
									label="С"
									value={get("from")}
									onChange={(value) => setParams({ from: value })}
								/>
								<DateInput
									label="По"
									value={get("to")}
									onChange={(value) => setParams({ to: value })}
								/>
							</>
						)}
						<Select
							label="Сравнение"
							value={period === "all" ? "none" : get("compare") || "previous"}
							disabled={period === "all"}
							onChange={(value) =>
								setParams({ compare: value === "previous" ? null : value })
							}
							options={COMPARE_MODES.map((m) => ({
								value: m.key,
								label: m.label,
							}))}
						/>
						{(tab === "overview" || tab === "customers") && (
							<Select
								label="Шаг"
								value={get("granularity") || "auto"}
								onChange={(value) =>
									setParams({ granularity: value === "auto" ? null : value })
								}
								options={GRANULARITIES.map((g) => ({
									value: g.key,
									label: g.label,
								}))}
							/>
						)}
					</div>
					<div className={styles.filterGrid}>
						<Select
							label="Статус"
							value={get("status")}
							onChange={(value) => setParams({ status: value })}
							allLabel="Все"
							options={STATUS_OPTIONS}
						/>
						<Select
							label="Покупатель"
							value={get("customerType")}
							onChange={(value) => setParams({ customerType: value })}
							allLabel="Все"
							options={CUSTOMER_TYPES.map((value) => ({
								value,
								label: CUSTOMER_TYPE_LABELS[value],
							}))}
						/>
						<Select
							label="Доставка"
							value={get("delivery")}
							onChange={(value) => setParams({ delivery: value })}
							allLabel="Все"
							options={DELIVERY_METHODS.map((value) => ({
								value,
								label: DELIVERY_LABELS[value],
							}))}
						/>
						<Select
							label="Оплата"
							value={get("payment")}
							onChange={(value) => setParams({ payment: value })}
							allLabel="Все"
							options={PAYMENT_METHODS.map((value) => ({
								value,
								label: PAYMENT_LABELS[value],
							}))}
						/>
						<Select
							label="Статус оплаты"
							value={get("paymentStatus")}
							onChange={(value) => setParams({ paymentStatus: value })}
							allLabel="Все"
							options={PAYMENT_STATUSES.map((value) => ({
								value,
								label: PAYMENT_STATUS_LABELS[value],
							}))}
						/>
						<Select
							label="Источник"
							value={get("source")}
							onChange={(value) => setParams({ source: value })}
							allLabel="Все"
							options={SOURCES.map((value) => ({
								value,
								label: SOURCE_LABELS[value],
							}))}
						/>
						<Select
							label="Категория"
							value={get("category")}
							onChange={(value) => setParams({ category: value })}
							allLabel="Все"
							options={(meta.data?.categories ?? []).map((c) => ({
								value: String(c.id),
								label: c.label,
							}))}
						/>
						<Select
							label="Регион"
							value={get("region")}
							onChange={(value) => setParams({ region: value })}
							allLabel="Все"
							options={(meta.data?.regions ?? []).map((r) => ({
								value: r.key,
								label: r.label,
							}))}
						/>
					</div>
					{activeFilters.length > 0 && (
						<div className={styles.chips}>
							{activeFilters.map((key) => (
								<button
									key={key}
									type="button"
									className={styles.chip}
									onClick={() => setParams({ [key]: null })}
									aria-label={`Снять фильтр: ${filterLabel(key)}`}
								>
									{filterLabel(key)} <span aria-hidden>×</span>
								</button>
							))}
							<button
								type="button"
								className={styles.chipReset}
								onClick={() =>
									setParams(
										Object.fromEntries(FILTER_KEYS.map((key) => [key, null])),
									)
								}
							>
								Сбросить все
							</button>
						</div>
					)}
					{get("category") && (
						<p className={styles.note}>
							При фильтре по категории заказы и выручка считаются по заказам,
							где есть её товары, а единицы и товарная выручка — только по её
							товарам.
						</p>
					)}
				</section>

				<div className={styles.tabs} role="tablist" aria-label="Разделы">
					{TABS.map((item) => (
						<button
							key={item.key}
							type="button"
							role="tab"
							aria-selected={tab === item.key}
							className={tab === item.key ? styles.tabActive : styles.tab}
							onClick={() =>
								setParams({
									tab: item.key === "overview" ? null : item.key,
								})
							}
						>
							{item.label}
						</button>
					))}
				</div>

				{tab === "overview" && (
					<OverviewSection {...sectionProps} onPeriod={setShownPeriod} />
				)}
				{tab === "products" && (
					<ProductsSection {...sectionProps} onPeriod={setShownPeriod} />
				)}
				{tab === "geo" && (
					<GeoSection {...sectionProps} onPeriod={setShownPeriod} />
				)}
				{tab === "customers" && (
					<CustomersSection {...sectionProps} onPeriod={setShownPeriod} />
				)}
				{tab === "funnel" && (
					<FunnelSection {...sectionProps} onPeriod={setShownPeriod} />
				)}
			</div>
		</TipProvider>
	);
}

function Select({
	label,
	value,
	onChange,
	options,
	allLabel,
	disabled,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	options: readonly { value: string; label: string }[];
	allLabel?: string;
	disabled?: boolean;
}) {
	return (
		<label className={styles.field}>
			<span className={styles.fieldLabel}>{label}</span>
			<select
				className={styles.select}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			>
				{allLabel && <option value="">{allLabel}</option>}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

function DateInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className={styles.field}>
			<span className={styles.fieldLabel}>{label}</span>
			<input
				type="date"
				className={styles.select}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</label>
	);
}
