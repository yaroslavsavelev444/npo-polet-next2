"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import styles from "./Cart.module.css";

interface Props {
	quantity: number;
	min: number;
	max: number;
	disabled?: boolean;
	title: string;
	onChange: (quantity: number) => void;
	/**
	 * Уход в ноль. Кнопка «−» на минимально возможном количестве превращается
	 * в удаление — иначе она просто перестаёт работать, и единственный способ
	 * убрать товар остаётся спрятанным за наведением. Так нижняя граница
	 * счётчика ведёт туда, куда пользователь и целился.
	 */
	onRemove: () => void;
}

/**
 * Счётчик количества в строке корзины.
 *
 * Введённое руками число НЕ отправляется на каждое нажатие клавиши: «12»
 * набирается через «1», и промежуточная единица ушла бы в корзину отдельной
 * записью. Значение фиксируется по Enter и по уходу фокуса — тогда же оно
 * приводится к допустимому диапазону.
 */
export function CartQuantityStepper({
	quantity,
	min,
	max,
	disabled = false,
	title,
	onChange,
	onRemove,
}: Props) {
	const inputId = useId();
	const [draft, setDraft] = useState(String(quantity));

	// Внешнее изменение (ответ сервера, откат, правка из другой вкладки)
	// обязано попасть в поле — иначе на экране останется отвергнутое число.
	useEffect(() => {
		setDraft(String(quantity));
	}, [quantity]);

	const safeMin = Math.max(min, 1);
	const atMinimum = quantity <= safeMin;

	function commit(rawValue: string) {
		const parsed = Number.parseInt(rawValue, 10);
		if (!Number.isFinite(parsed)) {
			setDraft(String(quantity));
			return;
		}
		if (parsed < 1) {
			onRemove();
			return;
		}
		const clamped = Math.min(Math.max(parsed, 1), max);
		setDraft(String(clamped));
		if (clamped !== quantity) onChange(clamped);
	}

	return (
		<div className={styles.stepper}>
			<button
				type="button"
				className={styles.stepperButton}
				disabled={disabled}
				onClick={() => (atMinimum ? onRemove() : onChange(quantity - 1))}
				aria-label={
					atMinimum
						? `Убрать «${title}» из корзины`
						: `Уменьшить количество «${title}»`
				}
			>
				{atMinimum ? (
					<Trash2 size={13} aria-hidden />
				) : (
					<Minus size={13} aria-hidden />
				)}
			</button>

			<input
				id={inputId}
				className={styles.stepperValue}
				type="number"
				inputMode="numeric"
				value={draft}
				min={1}
				max={max}
				disabled={disabled}
				// Ниже минимальной партии число оставаться может (так бывает у
				// корзин, собранных до того, как поставщик поднял минимум), но
				// сообщить об этом обязаны и полю, а не только тексту рядом.
				aria-invalid={quantity < safeMin || undefined}
				aria-label={`Количество «${title}», шт.`}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={(event) => commit(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit((event.target as HTMLInputElement).value);
					}
					if (event.key === "Escape") {
						setDraft(String(quantity));
					}
				}}
			/>

			<button
				type="button"
				className={styles.stepperButton}
				disabled={disabled || quantity >= max}
				onClick={() => onChange(quantity + 1)}
				aria-label={`Увеличить количество «${title}»`}
			>
				<Plus size={13} aria-hidden />
			</button>
		</div>
	);
}
