"use client";

import { X } from "lucide-react";
import { cn } from "@/utils/cn";

export interface FilterChipProps {
	label: string;
	onRemove: () => void;
	className?: string;
}

/** Дисмиссибл-чип активного фильтра — используется в тулбарах каталога/категорий. */
export function FilterChip({ label, onRemove, className }: FilterChipProps) {
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] !py-1 pl-3 pr-1.5 text-xs font-medium text-[var(--text-secondary)]",
				className,
			)}
		>
			{label}
			<button
				type="button"
				onClick={onRemove}
				aria-label={`Убрать фильтр: ${label}`}
				className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
			>
				<X size={11} aria-hidden />
			</button>
		</span>
	);
}

export default FilterChip;
