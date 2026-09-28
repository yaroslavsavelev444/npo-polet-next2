"use client";

import { useState } from "react";
import type { FacetValue } from "../types/filters";
import styles from "./Catalog.module.css";

interface FacetListProps {
	/** Имя группы для скринридера и (если не скрыто) над списком. */
	legend: string;
	showLegend?: boolean;
	values: FacetValue[];
	onToggle: (value: string) => void;
	/** Сколько значений видно до «Показать все». */
	limit?: number;
}

/**
 * Значения фасета — флажки, а не radio: внутри фасета значения складываются
 * (ИЛИ), и отметить можно несколько.
 *
 * Число справа — сколько товаров будет, если отметить значение при остальных
 * фильтрах (см. модель счётчиков в catalog-facets.service.ts). Значение, при
 * котором не останется ничего, не прячется, а гаснет: список не прыгает при
 * каждом щелчке, и видно, что такое значение в разделе есть.
 *
 * Длинный список свёрнут до limit строк; отмеченные значения видны всегда,
 * даже если стоят ниже границы, — иначе выбор можно было бы потерять из виду.
 */
export function FacetList({
	legend,
	showLegend = true,
	values,
	onToggle,
	limit = 8,
}: FacetListProps) {
	const [expanded, setExpanded] = useState(false);
	const hidden = values.length - limit;
	const visible =
		expanded || hidden <= 1
			? values
			: values.filter((value, index) => index < limit || value.selected);

	return (
		<fieldset className={styles.group}>
			<legend className={showLegend ? styles.micro : "sr-only"}>
				{legend}
			</legend>
			<div className={styles.optionList}>
				{visible.map((value) => {
					const disabled = value.count === 0 && !value.selected;
					return (
						<label
							key={value.value}
							className={styles.option}
							data-disabled={disabled || undefined}
						>
							<input
								type="checkbox"
								checked={value.selected}
								disabled={disabled}
								onChange={() => onToggle(value.value)}
								className={styles.controlInput}
							/>
							<span aria-hidden className={styles.optionBox} />
							<span className={styles.optionLabel}>{value.label}</span>
							<span className={styles.optionCount}>{value.count}</span>
						</label>
					);
				})}
			</div>
			{hidden > 1 && (
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					aria-expanded={expanded}
					className={styles.resetLink}
				>
					{expanded ? "Свернуть" : `Показать все (${values.length})`}
				</button>
			)}
		</fieldset>
	);
}

export default FacetList;
