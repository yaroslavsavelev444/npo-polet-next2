"use client";

import { useEffect, useState } from "react";
import styles from "./Catalog.module.css";

interface RangeFilterProps {
	/** Подпись группы; в поповере её уже несёт кнопка — тогда не передаётся. */
	label?: string;
	min: number;
	max: number;
	/** Текущий выбор из адреса; undefined — граница не задана. */
	from?: number;
	to?: number;
	/** Шаг шкалы и полей. */
	step?: number;
	/** Суффикс в поле («₽», «кВт»). */
	suffix?: string;
	format: (value: number) => string;
	/** Имя величины для скринридера: «Цена», «Мощность». */
	ariaName: string;
	/** Уходит в адрес с задержкой — вызывающая сторона передаёт debounced. */
	onCommit: (from: number | undefined, to: number | undefined) => void;
}

/**
 * Диапазон значений: два поля ввода и двухползунковая шкала над одними и теми
 * же значениями — общий орган для цены и числовых характеристик.
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
 * Граница, дотянутая до края шкалы, уходит как «не задана»: весь диапазон и
 * отсутствие фильтра — один и тот же адрес.
 */
export function RangeFilter({
	label,
	min: rawMin,
	max: rawMax,
	from,
	to,
	step = 1,
	suffix,
	format,
	ariaName,
	onCommit,
}: RangeFilterProps) {
	const min = rawMin;
	const max = Math.max(rawMax, min + step);

	const [localFrom, setLocalFrom] = useState(from ?? min);
	const [localTo, setLocalTo] = useState(to ?? max);

	useEffect(() => {
		setLocalFrom(from ?? min);
		setLocalTo(to ?? max);
	}, [from, to, min, max]);

	const commit = (nextFrom: number, nextTo: number) => {
		setLocalFrom(nextFrom);
		setLocalTo(nextTo);
		// Полшага допуска: дробный шаг не всегда ложится на край ровно.
		onCommit(
			nextFrom <= min + step / 2 ? undefined : nextFrom,
			nextTo >= max - step / 2 ? undefined : nextTo,
		);
	};

	const span = Math.max(max - min, step);
	const fromPct = ((localFrom - min) / span) * 100;
	const toPct = ((localTo - min) / span) * 100;

	return (
		<div className={styles.group}>
			<div className={styles.groupHead}>
				{label && <span className={styles.micro}>{label}</span>}
				<span className={styles.micro}>
					{format(localFrom)} — {format(localTo)}
				</span>
			</div>

			<div className={styles.priceInputs}>
				<div className={styles.priceField}>
					<input
						type="number"
						inputMode="decimal"
						min={min}
						max={localTo}
						step={step}
						value={localFrom}
						aria-label={`${ariaName} от`}
						onChange={(event) =>
							commit(
								Math.min(Number(event.target.value) || min, localTo),
								localTo,
							)
						}
						className={styles.priceInput}
					/>
					{suffix && (
						<span aria-hidden className={styles.priceSuffix}>
							{suffix}
						</span>
					)}
				</div>

				<span aria-hidden className={styles.priceDash} />

				<div className={styles.priceField}>
					<input
						type="number"
						inputMode="decimal"
						min={localFrom}
						max={max}
						step={step}
						value={localTo}
						aria-label={`${ariaName} до`}
						onChange={(event) =>
							commit(
								localFrom,
								Math.max(Number(event.target.value) || max, localFrom),
							)
						}
						className={styles.priceInput}
					/>
					{suffix && (
						<span aria-hidden className={styles.priceSuffix}>
							{suffix}
						</span>
					)}
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
					step={step}
					value={localFrom}
					aria-label={`${ariaName}: минимум`}
					onChange={(event) =>
						commit(
							Math.min(Number(event.target.value), localTo - step),
							localTo,
						)
					}
					className={styles.sliderInput}
				/>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={localTo}
					aria-label={`${ariaName}: максимум`}
					onChange={(event) =>
						commit(
							localFrom,
							Math.max(Number(event.target.value), localFrom + step),
						)
					}
					className={styles.sliderInput}
				/>
			</div>
		</div>
	);
}

export default RangeFilter;
