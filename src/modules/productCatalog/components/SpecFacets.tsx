"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import { formatFacetNumber, rangeStep } from "../lib/catalogOptions";
import type { SpecFacet } from "../types/filters";
import styles from "./Catalog.module.css";
import { FacetList } from "./FacetList";
import { RangeFilter } from "./RangeFilter";

/** Сколько фасетов раскрыто сразу — остальные свёрнуты до заголовка. */
const OPEN_BY_DEFAULT = 4;

function isActive(facet: SpecFacet): boolean {
	return facet.kind === "list"
		? facet.values.some((value) => value.selected)
		: facet.selectedMin !== undefined || facet.selectedMax !== undefined;
}

function activeCount(facet: SpecFacet): number {
	if (facet.kind === "range") return isActive(facet) ? 1 : 0;
	return facet.values.filter((value) => value.selected).length;
}

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
export function SpecFacets({ facets }: { facets: SpecFacet[] }) {
	const { toggleSpecValue, debouncedSetSpecRange } = useProductFilters();

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
						const open = index++ < OPEN_BY_DEFAULT || isActive(facet);
						const count = activeCount(facet);
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
											values={facet.values}
											onToggle={(value) => toggleSpecValue(facet.key, value)}
										/>
									) : (
										<RangeFilter
											min={facet.min}
											max={facet.max}
											from={facet.selectedMin}
											to={facet.selectedMax}
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
