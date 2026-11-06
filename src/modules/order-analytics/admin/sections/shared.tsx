"use client";

import { type ReactNode, useEffect } from "react";
import type { CompareMode } from "../../lib/constants";
import type { PeriodInfo } from "../../lib/types";
import styles from "../analytics.module.css";

export interface SectionProps {
	params: string;
	reloadKey: number;
	setParams: (changes: Record<string, string | null>) => void;
	searchParams: URLSearchParams | ReadonlyURLSearchParamsLike;
	onPeriod: (period: PeriodInfo) => void;
}

interface ReadonlyURLSearchParamsLike {
	get(name: string): string | null;
}

export function usePeriodReport(
	period: PeriodInfo | undefined,
	onPeriod: (period: PeriodInfo) => void,
) {
	useEffect(() => {
		if (period) onPeriod(period);
	}, [period, onPeriod]);
}

export function compareName(mode: CompareMode | undefined): string {
	return mode === "year" ? "к прошлому году" : "к предыдущему периоду";
}

export function Frame({
	loading,
	error,
	hasData,
	children,
}: {
	loading: boolean;
	error: string | null;
	hasData: boolean;
	children: ReactNode;
}) {
	return (
		<div>
			{error && (
				<p className={styles.error} role="alert">
					{error}
				</p>
			)}
			{!hasData && !error && (
				<p className={styles.empty} aria-busy="true">
					Считаем показатели…
				</p>
			)}
			{hasData && (
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
