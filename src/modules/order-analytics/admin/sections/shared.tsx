"use client";

import { type ReactNode, useLayoutEffect } from "react";
import type { CompareMode } from "../../lib/constants";
import type { PeriodInfo } from "../../lib/types";
import styles from "../analytics.module.css";

export interface ReportHeading {
	description: string;
	period: PeriodInfo;
}

export interface SectionProps {
	params: string;
	reloadKey: number;
	setParams: (changes: Record<string, string | null>) => void;
	searchParams: URLSearchParams | ReadonlyURLSearchParamsLike;
	onReport: (heading: ReportHeading | null) => void;
	describeReport: (params: URLSearchParams, period: PeriodInfo) => string;
}

interface ReadonlyURLSearchParamsLike {
	get(name: string): string | null;
}

export function compareName(mode: CompareMode | undefined): string {
	return mode === "year" ? "к прошлому году" : "к предыдущему периоду";
}

export function Frame({
	loading,
	error,
	data,
	shownParams,
	retry,
	describeReport,
	onReport,
	children,
}: {
	loading: boolean;
	error: string | null;
	data: { period: PeriodInfo } | null;
	shownParams: URLSearchParams | null;
	retry: () => void;
	describeReport: SectionProps["describeReport"];
	onReport?: SectionProps["onReport"];
	children: ReactNode;
}) {
	const period = data?.period;
	const description =
		period && shownParams ? describeReport(shownParams, period) : null;
	useLayoutEffect(() => {
		onReport?.(period && description ? { period, description } : null);
	}, [period, description, onReport]);

	return (
		<div>
			{error && (
				<div className={styles.error}>
					<div role="alert">
						<p>
							{data
								? "Не удалось обновить отчёт."
								: "Не удалось загрузить отчёт."}
						</p>
						{description && <p>Показаны данные за {description}.</p>}
						<p className={styles.note}>{error}</p>
					</div>
					<button type="button" className={styles.ghostButton} onClick={retry}>
						Повторить
					</button>
				</div>
			)}
			{!error && loading && (
				<p className={styles.empty} role="status">
					{description
						? `Обновляем отчёт. Пока показаны данные за ${description}.`
						: "Считаем показатели…"}
				</p>
			)}
			{data && (
				<div className={loading ? styles.stale : undefined} aria-busy={loading}>
					{children}
				</div>
			)}
		</div>
	);
}

export function Card({
	title,
	hint,
	span = 12,
	action,
	children,
}: {
	title: string;
	hint?: ReactNode;
	span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className={`${styles.card} ${styles[`span${span}`]}`}>
			<header className={styles.cardHead}>
				<div>
					<h2 className={styles.cardTitle}>{title}</h2>
					{hint && <p className={styles.cardHint}>{hint}</p>}
				</div>
				{action}
			</header>
			{children}
		</section>
	);
}

export function Note({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<aside className={styles.callout}>
			{title && <strong className={styles.calloutTitle}>{title}</strong>}
			<div>{children}</div>
		</aside>
	);
}

export function Segmented<T extends string>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly { value: T; label: string }[];
	label: string;
}) {
	return (
		<div className={styles.segmented} role="group" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={value === option.value}
					className={
						value === option.value ? styles.segmentedOn : styles.segmentedOff
					}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
