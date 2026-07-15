"use client";

import { ArrowUpDown, ChevronDown } from "lucide-react";
import { Dropdown } from "@/UI";
import { useProductFilters } from "../hooks/useProductFilters";
import { findSortOption, SORT_OPTIONS } from "../lib/catalogOptions";

export function SortMenu() {
	const { sort, updateSort } = useProductFilters();
	const current = findSortOption(sort.field, sort.order);

	return (
		<Dropdown
			selectedKey={current.value}
			items={SORT_OPTIONS.map((option) => ({
				key: option.value,
				label: option.label,
			}))}
			onSelect={(key) => {
				const option = SORT_OPTIONS.find((o) => o.value === key);
				if (option) updateSort(option.field, option.order);
			}}
			placement="bottom-end"
		>
			<button
				type="button"
				className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-light)]"
			>
				<ArrowUpDown
					size={14}
					className="text-[var(--text-muted)]"
					aria-hidden
				/>
				{current.label}
				<ChevronDown
					size={14}
					className="text-[var(--text-muted)]"
					aria-hidden
				/>
			</button>
		</Dropdown>
	);
}

export default SortMenu;
