"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import { formatFacetNumber, rangeStep } from "../lib/catalogOptions";
import type { SpecFacet } from "../types/filters";
import styles from "./Catalog.module.css";
import { FacetList } from "./FacetList";
import { RangeFilter } from "./RangeFilter";

/** Сколько фасетов раскрыто сразу — остальные свёрнуты до заголовка. */
const OPEN_BY_DEFAULT = 4;

/**
 * Фасеты по характеристикам раздела — в порядке, который отдал сервер
 * (словарь раздела, затем охват товаров), разложенные по группам
 * характеристик («Электропитание», «Условия эксплуатации»…) — тем же, что
 * на странице товара.
 *
 * Каждый фасет — нативный <details>: характеристик у раздела бывает два
 * десятка, и раскрытые все сразу превратили бы лист в ленту на несколько
 * экранов. Первые несколько и все, где что-то выбрано, раскрыты.
 */
export function SpecFacets({
	facets,
	showCounts,
}: {
	facets: SpecFacet[];
	showCounts: boolean;
}) {
	const {
		facets: selection,
		toggleSpecValue,
		debouncedSetSpecRange,
	} = useProductFilters();

	const sections: { group: string | null; items: SpecFacet[] }[] = [];
	for (const facet of facets) {
		const section = sections.find((s) => s.group === facet.group);
		if (section) section.items.push(facet);
		else sections.push({ group: facet.group, items: [facet] });
	}

	let index = 0;
	return (
		<>
			{sections.map((section) => (
				<section key={section.group ?? ""} className={styles.facetSection}>
					<h3 className={styles.micro}>{section.group ?? "Характеристики"}</h3>
					{section.items.map((facet) => {
						const selected = selection.specs[facet.key];
						const values = selected?.values ?? [];
						const count =
							facet.kind === "list"
								? values.length
								: Number(
										selected?.min !== undefined || selected?.max !== undefined,
									);
						const open = index++ < OPEN_BY_DEFAULT || count > 0;
						return (
							<details key={facet.key} open={open} className={styles.facet}>
								<summary className={styles.facetSummary}>
									<span className={styles.facetTitle}>
										{facet.label}
										{facet.kind === "range" && facet.unit
											? `, ${facet.unit}`
											: ""}
									</span>
									{count > 0 && (
										<span className={styles.controlBadge}>{count}</span>
									)}
								</summary>
								<div className={styles.facetBody}>
									{facet.kind === "list" ? (
										<FacetList
											legend={facet.label}
											showLegend={false}
											values={facet.values.map((value) => ({
												...value,
												selected: values.includes(value.value),
											}))}
											onToggle={(value) => toggleSpecValue(facet.key, value)}
											showCounts={showCounts}
										/>
									) : (
										<RangeFilter
											min={facet.min}
											max={facet.max}
											from={selected?.min}
											to={selected?.max}
											step={rangeStep(facet.min, facet.max)}
											suffix={facet.unit ?? undefined}
											format={(value) => formatFacetNumber(value, facet.unit)}
											ariaName={facet.label}
											onCommit={(min, max) =>
												debouncedSetSpecRange(facet.key, min, max)
											}
										/>
									)}
								</div>
							</details>
						);
					})}
				</section>
			))}
		</>
	);
}

export default SpecFacets;
