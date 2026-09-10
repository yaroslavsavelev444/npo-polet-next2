"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/modules/productCard";
import { useProductFilters } from "../hooks/useProductFilters";
import type { PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";

interface PriceFilterProps {
	priceBounds: PriceBounds;
	/** Имя группы. В поповере его уже несёт кнопка, которой поповер открыли, —
	 *  и печатать «Цена» второй раз в трёх сантиметрах от первого незачем.
	 *  Живой диапазон значений показывается всегда: это единственная подпись,
	 *  которая отвечает на вопрос «что я сейчас выбрал». */
	showLabel?: boolean;
}

/**
 * Диапазон цены: два поля ввода и двухползунковая шкала над одними и теми же
 * значениями.
 *
 * Поля и шкала — не дубль друг друга, а два способа задать одно: шкалой
 * прикидывают («примерно в середине»), полем указывают точно. В промышленном
 * каталоге с разбросом от 2 400 до 1 249 000 ₽ одной шкалы физически мало —
 * один пиксель дорожки стоит несколько тысяч рублей.
 *
 * Локальное состояние ведёт себя как «представление», а URL — как источник
 * истины: пока палец на ползунке, значение меняется мгновенно (это требование
 * к отклику, а не к сети), а в адрес оно уходит с задержкой. Внешние
 * изменения адреса — сброс фильтров, «назад» — подхватываются эффектом.
 */
export function PriceFilter({
	priceBounds,
	showLabel = true,
}: PriceFilterProps) {
	const { filters, debouncedUpdateFilters } = useProductFilters();

	const min = priceBounds.min;
	const max = Math.max(priceBounds.max, min + 1);

	const [localFrom, setLocalFrom] = useState(filters.priceFrom ?? min);
	const [localTo, setLocalTo] = useState(filters.priceTo ?? max);

	useEffect(() => {
		setLocalFrom(filters.priceFrom ?? min);
		setLocalTo(filters.priceTo ?? max);
	}, [filters.priceFrom, filters.priceTo, min, max]);

	const commit = (from: number, to: number) => {
		setLocalFrom(from);
		setLocalTo(to);
		debouncedUpdateFilters({
			priceFrom: from <= min ? undefined : from,
			priceTo: to >= max ? undefined : to,
		});
	};

	const span = Math.max(max - min, 1);
	const fromPct = ((localFrom - min) / span) * 100;
	const toPct = ((localTo - min) / span) * 100;

	return (
		<div className={styles.group}>
			<div className={styles.groupHead}>
				{showLabel && <span className={styles.micro}>Цена</span>}
				<span className={styles.micro}>
					{formatPrice(localFrom)} — {formatPrice(localTo)}
				</span>
			</div>

			<div className={styles.priceInputs}>
				<div className={styles.priceField}>
					<input
						type="number"
						inputMode="numeric"
						min={min}
						max={localTo}
						value={localFrom}
						aria-label="Цена от"
						onChange={(event) =>
							commit(
								Math.min(Number(event.target.value) || min, localTo),
								localTo,
							)
						}
						className={styles.priceInput}
					/>
					<span aria-hidden className={styles.priceSuffix}>
						₽
					</span>
				</div>

				<span aria-hidden className={styles.priceDash} />

				<div className={styles.priceField}>
					<input
						type="number"
						inputMode="numeric"
						min={localFrom}
						max={max}
						value={localTo}
						aria-label="Цена до"
						onChange={(event) =>
							commit(
								localFrom,
								Math.max(Number(event.target.value) || max, localFrom),
							)
						}
						className={styles.priceInput}
					/>
					<span aria-hidden className={styles.priceSuffix}>
						₽
					</span>
				</div>
			</div>

			<div className={styles.slider}>
				<span aria-hidden className={styles.sliderTrack} />
				<span
					aria-hidden
					className={styles.sliderFill}
					style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
				/>
				<input
					type="range"
					min={min}
					max={max}
					value={localFrom}
					aria-label="Минимальная цена"
					onChange={(event) =>
						commit(Math.min(Number(event.target.value), localTo - 1), localTo)
					}
					className={styles.sliderInput}
				/>
				<input
					type="range"
					min={min}
					max={max}
					value={localTo}
					aria-label="Максимальная цена"
					onChange={(event) =>
						commit(
							localFrom,
							Math.max(Number(event.target.value), localFrom + 1),
						)
					}
					className={styles.sliderInput}
				/>
			</div>
		</div>
	);
}

export default PriceFilter;
