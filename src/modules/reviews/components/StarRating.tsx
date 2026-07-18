import { Star } from "lucide-react";
import { cn } from "@/utils/cn";

interface StarRatingProps {
	/** Оценка 0..5, может быть дробной (для среднего рейтинга). */
	value: number;
	/** Размер звезды в пикселях. */
	size?: number;
	className?: string;
}

/**
 * Отображение рейтинга звёздами. Поддерживает дробное значение: последняя
 * звезда заполняется частично через наложение обрезанного по ширине слоя —
 * поэтому 4.3 читается честно, а не округляется. Чисто презентационный
 * компонент (без "use client"), рендерится и на сервере.
 */
export function StarRating({ value, size = 16, className }: StarRatingProps) {
	const clamped = Math.max(0, Math.min(5, value));

	return (
		<span
			className={cn("inline-flex items-center gap-0.5", className)}
			role="img"
			aria-label={`Рейтинг ${clamped.toFixed(1)} из 5`}
		>
			{Array.from({ length: 5 }, (_, i) => {
				const fill = Math.max(0, Math.min(1, clamped - i));
				return (
					<span
						key={i}
						className="relative inline-block shrink-0"
						style={{ width: size, height: size }}
					>
						<Star
							size={size}
							className="absolute inset-0 text-[var(--border-light)]"
							aria-hidden
						/>
						{fill > 0 && (
							<span
								className="absolute inset-0 overflow-hidden"
								style={{ width: `${fill * 100}%` }}
							>
								<Star
									size={size}
									className="fill-[var(--warning)] text-[var(--warning)]"
									aria-hidden
								/>
							</span>
						)}
					</span>
				);
			})}
		</span>
	);
}
