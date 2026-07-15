"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { useProductFilters } from "../hooks/useProductFilters";
import { STATUS_OPTIONS } from "../lib/catalogOptions";
import type { PriceBounds } from "../types/filters";

const THUMB_CLASSES =
	"pointer-events-none absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 appearance-none bg-transparent " +
	"[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 " +
	"[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
	"[&::-webkit-slider-thumb]:border-[var(--surface)] [&::-webkit-slider-thumb]:bg-[var(--primary)] " +
	"[&::-webkit-slider-thumb]:shadow-[0_1px_4px_var(--shadow-color)] [&::-webkit-slider-thumb]:cursor-pointer " +
	"[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 " +
	"[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--surface)] " +
	"[&::-moz-range-thumb]:bg-[var(--primary)] [&::-moz-range-thumb]:cursor-pointer";

interface PriceRangeSliderProps {
	min: number;
	max: number;
	from: number;
	to: number;
	onChange: (from: number, to: number) => void;
}

// Классический приём для двухползункового range: два наложенных нативных
// <input type="range">, трек рисуется отдельным div поверх/под ними —
// без сторонних библиотек.
function PriceRangeSlider({
	min,
	max,
	from,
	to,
	onChange,
}: PriceRangeSliderProps) {
	const span = Math.max(max - min, 1);
	const fromPct = ((from - min) / span) * 100;
	const toPct = ((to - min) / span) * 100;

	return (
		<div className="relative h-4 w-full">
			<div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--surface-secondary)]" />
			<div
				className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--primary)]"
				style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
			/>
			<input
				type="range"
				min={min}
				max={max}
				value={from}
				aria-label="Минимальная цена"
				onChange={(e) => onChange(Math.min(Number(e.target.value), to - 1), to)}
				className={THUMB_CLASSES}
			/>
			<input
				type="range"
				min={min}
				max={max}
				value={to}
				aria-label="Максимальная цена"
				onChange={(e) =>
					onChange(from, Math.max(Number(e.target.value), from + 1))
				}
				className={THUMB_CLASSES}
			/>
		</div>
	);
}

interface FiltersPanelProps {
	priceBounds: PriceBounds;
	className?: string;
}

export function FiltersPanel({ priceBounds, className }: FiltersPanelProps) {
	const {
		filters,
		updateFilters,
		debouncedUpdateFilters,
		resetFilters,
		activeFiltersCount,
	} = useProductFilters();

	const min = priceBounds.min;
	const max = Math.max(priceBounds.max, min + 1);

	const [localFrom, setLocalFrom] = useState(filters.priceFrom ?? min);
	const [localTo, setLocalTo] = useState(filters.priceTo ?? max);

	// Подхватываем внешние изменения URL (сброс фильтров, навигация назад/вперёд)
	useEffect(() => {
		setLocalFrom(filters.priceFrom ?? min);
		setLocalTo(filters.priceTo ?? max);
	}, [filters.priceFrom, filters.priceTo, min, max]);

	const handlePriceChange = (from: number, to: number) => {
		setLocalFrom(from);
		setLocalTo(to);
		debouncedUpdateFilters({
			priceFrom: from <= min ? undefined : from,
			priceTo: to >= max ? undefined : to,
		});
	};

	return (
		<div className={cn("flex flex-col gap-7", className)}>
			<section className="flex flex-col gap-4">
				<span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
					Цена, ₽
				</span>

				<div className="flex items-center gap-3">
					<input
						type="number"
						inputMode="numeric"
						min={min}
						max={localTo}
						value={localFrom}
						onChange={(e) =>
							handlePriceChange(Number(e.target.value) || min, localTo)
						}
						aria-label="Цена от"
						className="w-full min-w-0 rounded-md border border-[var(--border)] bg-(--input-bg) px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
					<span className="shrink-0 text-[var(--text-muted)]">—</span>
					<input
						type="number"
						inputMode="numeric"
						min={localFrom}
						max={max}
						value={localTo}
						onChange={(e) =>
							handlePriceChange(localFrom, Number(e.target.value) || max)
						}
						aria-label="Цена до"
						className="w-full min-w-0 rounded-md border border-[var(--border)] bg-(--input-bg) px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
				</div>

				<PriceRangeSlider
					min={min}
					max={max}
					from={localFrom}
					to={localTo}
					onChange={handlePriceChange}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<span className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
					Наличие
				</span>
				<div className="flex flex-wrap gap-2">
					{STATUS_OPTIONS.map((option) => {
						const active = filters.status === option.value;
						return (
							<button
								key={option.value}
								type="button"
								aria-pressed={active}
								onClick={() => updateFilters({ status: option.value })}
								className={cn(
									"rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
									active
										? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
										: "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-light)] hover:text-[var(--text-primary)]",
								)}
							>
								{option.label}
							</button>
						);
					})}
				</div>
			</section>

			<button
				type="button"
				onClick={resetFilters}
				disabled={activeFiltersCount === 0}
				className="flex items-center gap-1.5 self-start text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
			>
				<RotateCcw size={14} aria-hidden />
				Сбросить все фильтры
			</button>
		</div>
	);
}

export default FiltersPanel;
