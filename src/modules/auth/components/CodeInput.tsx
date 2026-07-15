"use client";

import {
	type ChangeEvent,
	type ClipboardEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/utils/cn";

interface CodeInputProps {
	/** Ровно `length` символов: цифра или пробел на месте незаполненной ячейки. */
	value: string;
	onChange: (value: string) => void;
	onComplete?: (value: string) => void;
	disabled?: boolean;
	error?: boolean;
	autoFocus?: boolean;
	className?: string;
	inputClassName?: string;
	length?: number;
	/** Увеличивается родителем при каждой новой ошибке — переигрывает анимацию тряски. */
	shakeSignal?: number;
}

/**
 * Сегментированный ввод одноразового кода — по одному полю на цифру.
 *
 * Поля используют `maxLength = length`, а не `1`: при `maxLength = 1` браузер
 * обрезает value ДО onChange, поэтому вставка/автозаполнение нескольких цифр
 * в одно поле теряло весь код, кроме первой цифры. Распределение по ячейкам
 * теперь делает JS (handleChange/handlePaste), а не браузер.
 *
 * `value` всегда хранит фиксированную длину `length` (пробел = пустая
 * ячейка), чтобы редактирование цифры в середине не сдвигало соседние —
 * иначе, например, удаление второй цифры из "123456" превратило бы её
 * в "13456" и все цифры после съехали бы на позицию влево.
 */
export function CodeInput({
	value,
	onChange,
	onComplete,
	disabled = false,
	error = false,
	autoFocus = false,
	className,
	inputClassName,
	length = 6,
	shakeSignal = 0,
}: CodeInputProps) {
	const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
	const isInternalChange = useRef(false);
	const [shaking, setShaking] = useState(false);
	const digits = value.padEnd(length, " ").split("").slice(0, length);

	// biome-ignore lint/correctness/useExhaustiveDependencies: должно сработать один раз при монтировании
	useEffect(() => {
		if (autoFocus) inputRefs.current[0]?.focus();
	}, []);

	// Фокус для изменений value, пришедших НЕ из обработчиков этого компонента
	// (например, родитель подставил вставленный из буфера код или сбросил
	// значение после ошибки) — приземляемся на первую пустую ячейку.
	// biome-ignore lint/correctness/useExhaustiveDependencies: намеренно следим только за value — digits пересчитывается из него каждый рендер (новый массив), а length/disabled — редко меняющиеся пропсы, чьё изменение само по себе не должно красть фокус
	useEffect(() => {
		if (isInternalChange.current) {
			isInternalChange.current = false;
			return;
		}
		if (disabled) return;
		const firstEmpty = digits.findIndex((d) => d === " " || d === "");
		inputRefs.current[firstEmpty === -1 ? length - 1 : firstEmpty]?.focus();
	}, [value]);

	useEffect(() => {
		if (shakeSignal > 0) setShaking(true);
	}, [shakeSignal]);

	const commit = (newDigits: string[], focusIndex?: number) => {
		isInternalChange.current = true;
		const newValue = newDigits.join("").slice(0, length).padEnd(length, " ");
		onChange(newValue);
		if (focusIndex !== undefined) inputRefs.current[focusIndex]?.focus();
		const compact = newValue.replace(/\s/g, "");
		if (compact.length === length) onComplete?.(compact);
	};

	const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/\D/g, "");

		if (raw.length <= 1) {
			const newDigits = [...digits];
			newDigits[index] = raw || " ";
			commit(newDigits, raw && index < length - 1 ? index + 1 : index);
			return;
		}

		// Несколько цифр за одно событие — автозаполнение OTP на мобильных.
		// Полный код всегда распределяем с начала, а не с текущей ячейки.
		const newDigits = [...digits];
		for (let i = 0; i < raw.length && i < length; i++) newDigits[i] = raw[i];
		commit(newDigits, Math.min(raw.length, length - 1));
	};

	const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Backspace") {
			if (digits[index] && digits[index] !== " ") return; // обработает onChange
			if (index > 0) {
				e.preventDefault();
				const newDigits = [...digits];
				newDigits[index - 1] = " ";
				commit(newDigits, index - 1);
			}
			return;
		}
		if (e.key === "ArrowLeft" && index > 0) {
			e.preventDefault();
			inputRefs.current[index - 1]?.focus();
			return;
		}
		if (e.key === "ArrowRight" && index < length - 1) {
			e.preventDefault();
			inputRefs.current[index + 1]?.focus();
		}
	};

	const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
		e.preventDefault();
		const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
		if (!pasted) return;

		const newDigits = [...digits];
		for (let i = 0; i < pasted.length && i < length; i++)
			newDigits[i] = pasted[i];
		commit(newDigits, Math.min(pasted.length, length - 1));
	};

	const handleFocus = (index: number) => {
		inputRefs.current[index]?.select();
	};

	return (
		<div
			role="group"
			aria-label="Код подтверждения"
			className={cn(
				"flex justify-center gap-2 sm:gap-2.5",
				shaking && "animate-[shake_400ms_ease-in-out]",
				className,
			)}
			onAnimationEnd={() => setShaking(false)}
		>
			{Array.from({ length }).map((_, index) => {
				const filled = !!digits[index] && digits[index] !== " ";
				return (
					<input
						key={index}
						ref={(el) => {
							inputRefs.current[index] = el;
						}}
						type="text"
						inputMode="numeric"
						autoComplete={index === 0 ? "one-time-code" : "off"}
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						maxLength={length}
						value={filled ? digits[index] : ""}
						onChange={(e) => handleChange(index, e)}
						onKeyDown={(e) => handleKeyDown(index, e)}
						onPaste={handlePaste}
						onFocus={() => handleFocus(index)}
						disabled={disabled}
						aria-label={`Цифра ${index + 1} из ${length}`}
						aria-invalid={error}
						className={cn(
							"h-12 w-10 sm:h-14 sm:w-12 rounded-[var(--radius-sm)] border bg-(--input-bg)",
							"text-center text-xl sm:text-2xl font-semibold text-[var(--text-primary)]",
							"transition-[border-color,box-shadow] duration-150 ease-out",
							"focus:outline-none focus:ring-4 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]",
							"disabled:opacity-50 disabled:cursor-not-allowed",
							error
								? "border-[var(--error)] focus:ring-[var(--error)]/20 focus:border-[var(--error)]"
								: filled
									? "border-[var(--border-light)]"
									: "border-[var(--border)]",
							inputClassName,
						)}
					/>
				);
			})}
		</div>
	);
}
