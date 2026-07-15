"use client";

import { Check } from "lucide-react";
import { Drawer } from "@/UI";
import { cn } from "@/utils/cn";
import { useProductFilters } from "../hooks/useProductFilters";
import { findSortOption, SORT_OPTIONS } from "../lib/catalogOptions";

interface Props {
	open: boolean;
	onClose: () => void;
}

export function MobileSortSheet({ open, onClose }: Props) {
	const { sort, updateSort } = useProductFilters();
	const current = findSortOption(sort.field, sort.order);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			title="Сортировка"
			placement="bottom"
			size="min(70vh, 480px)"
			className="overflow-hidden rounded-t-[var(--radius-lg)]"
		>
			<div className="flex flex-col gap-0.5">
				{SORT_OPTIONS.map((option) => {
					const active = option.value === current.value;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								updateSort(option.field, option.order);
								onClose();
							}}
							className={cn(
								"flex items-center justify-between gap-3 rounded-md px-3 py-3 text-left text-sm transition-colors",
								active
									? "font-medium text-[var(--primary)]"
									: "text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]",
							)}
						>
							{option.label}
							{active && <Check size={16} aria-hidden />}
						</button>
					);
				})}
			</div>
		</Drawer>
	);
}

export default MobileSortSheet;
