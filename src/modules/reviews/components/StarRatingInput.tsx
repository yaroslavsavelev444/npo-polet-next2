"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";

interface StarRatingInputProps {
	value: number;
	onChange: (value: number) => void;
	/** Размер звезды в пикселях. */
	size?: number;
	disabled?: boolean;
}

const LABELS = ["Ужасно", "Плохо", "Нормально", "Хорошо", "Отлично"] as const;

/**
 * Интерактивный выбор оценки 1..5. При наведении/фокусе подсвечиваются все
 * звёзды до текущей включительно (как в современных магазинах). Полностью
 * доступен с клавиатуры: radiogroup + стрелки.
 */
export function StarRatingInput({
	value,
	onChange,
	size = 32,
	disabled = false,
}: StarRatingInputProps) {
	const [hover, setHover] = useState(0);
	const shown = hover || value;

	function handleKeyDown(e: React.KeyboardEvent) {
		if (disabled) return;
		if (e.key === "ArrowRight" || e.key === "ArrowUp") {
			e.preventDefault();
			onChange(Math.min(5, (value || 0) + 1));
		} else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
			e.preventDefault();
			onChange(Math.max(1, (value || 1) - 1));
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<div
				role="radiogroup"
				aria-label="Оценка товара"
				className="flex items-center gap-1"
				onKeyDown={handleKeyDown}
			>
				{Array.from({ length: 5 }, (_, i) => {
					const starValue = i + 1;
					const active = starValue <= shown;
					return (
						<button
							key={starValue}
							type="button"
							role="radio"
							aria-checked={value === starValue}
							aria-label={`${starValue} — ${LABELS[i]}`}
							disabled={disabled}
							tabIndex={value === starValue || (!value && i === 0) ? 0 : -1}
							onMouseEnter={() => setHover(starValue)}
							onMouseLeave={() => setHover(0)}
							onFocus={() => setHover(starValue)}
							onBlur={() => setHover(0)}
							onClick={() => onChange(starValue)}
							className={cn(
								"rounded-[var(--radius-sm)] p-0.5 transition-transform duration-150",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
								!disabled && "hover:scale-110 cursor-pointer",
								disabled && "cursor-not-allowed opacity-60",
							)}
						>
							<Star
								size={size}
								className={cn(
									"transition-colors duration-150",
									active
										? "fill-[var(--warning)] text-[var(--warning)]"
										: "text-[var(--border-light)]",
								)}
								aria-hidden
							/>
						</button>
					);
				})}
			</div>
			<span
				className="text-sm font-medium text-[var(--text-secondary)] min-h-[1.25rem]"
				aria-live="polite"
			>
				{shown ? LABELS[shown - 1] : "Выберите оценку"}
			</span>
		</div>
	);
}
