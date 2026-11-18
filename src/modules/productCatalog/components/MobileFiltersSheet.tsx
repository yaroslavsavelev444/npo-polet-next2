"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import {
	FilterDraftContext,
	useProductFilters,
} from "../hooks/useProductFilters";
import type { CatalogFacets, PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";
import { CatalogSheet } from "./CatalogSheet";
import { FiltersPanel } from "./FiltersPanel";

interface Props {
	open: boolean;
	onClose: () => void;
	priceBounds: PriceBounds;
	facets: CatalogFacets;
}

/** Лист редактирует копию параметров до нажатия «Показать». */
export function MobileFiltersSheet(props: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const appliedQuery = useSearchParams().toString();
	const [draftQuery, setDraftQuery] = useState(appliedQuery);
	const { open, onClose } = props;

	useLayoutEffect(() => {
		if (open) setDraftQuery(appliedQuery);
	}, [open, appliedQuery]);

	const hasChanges = draftQuery !== appliedQuery;
	function applyFilters() {
		if (hasChanges) {
			const params = new URLSearchParams(draftQuery);
			params.set("page", "1");
			router.replace(`${pathname}?${params.toString()}`, { scroll: false });
		}
		onClose();
	}

	return (
		<FilterDraftContext
			value={{ params: draftQuery, setParams: setDraftQuery }}
		>
			<FilterSheet {...props} onApply={applyFilters} showCounts={!hasChanges} />
		</FilterDraftContext>
	);
}

function FilterSheet({
	open,
	onClose,
	priceBounds,
	facets,
	onApply,
	showCounts,
}: Props & { onApply: () => void; showCounts: boolean }) {
	const { activeFiltersCount, resetFilters } = useProductFilters();

	return (
		<CatalogSheet
			open={open}
			onClose={onClose}
			title="Фильтры"
			titleNote={
				activeFiltersCount > 0 ? (
					<span className={styles.micro}>
						{activeFiltersCount === 1
							? "1 активен"
							: `${activeFiltersCount} активны`}
					</span>
				) : undefined
			}
			footer={
				<>
					<button
						type="button"
						onClick={resetFilters}
						disabled={activeFiltersCount === 0}
						className={styles.sheetReset}
					>
						Сбросить
					</button>
					<button type="button" onClick={onApply} className={styles.sheetApply}>
						Показать
					</button>
				</>
			}
		>
			<FiltersPanel
				key={open ? "open" : "closed"}
				priceBounds={priceBounds}
				facets={facets}
				showCounts={showCounts}
			/>
		</CatalogSheet>
	);
}

export default MobileFiltersSheet;
