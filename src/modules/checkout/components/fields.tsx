"use client";

import { AlertCircle, ChevronDown } from "lucide-react";
import type {
	InputHTMLAttributes,
	ReactNode,
	Ref,
	SelectHTMLAttributes,
	TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import styles from "./Checkout.module.css";

/**
 * Поля формы оформления заказа.
 *
 * Своя разметка, а не UI/Input, по той же причине, по которой её завели
 * кабинет и форма обратной связи: у примитива поле — коробка с заливкой
 * --input-bg, скруглением и кольцом focus:ring, то есть материал прежней
 * версии витрины. В обновлённой системе поле — строка с подчёркиванием, по
 * которой при фокусе прочерчивается акцент.
 *
 * Сам UI/Input при этом не тронут: он стоит в форме входа, регистрации и
 * сброса пароля, и его вид — отдельная задача про те страницы.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ОБЯЗАТЕЛЬНО И ПОЧЕМУ
 * ────────────────────────────────────────────────────────────────────────────
 * • id приходит СНАРУЖИ, а не из useId. На эти id ссылается общий список
 *   ошибок (CHECKOUT_FIELD_IDS), и сгенерированный id снаружи знать
 *   невозможно. Там, где поле в списке ошибок не участвует, id генерируется
 *   сам.
 * • Сообщение об ошибке связано с полем через aria-describedby, а не просто
 *   лежит рядом: без связи скринридер прочитает поле как обычное, не сказав,
 *   что с ним не так.
 * • Обязательность помечена и знаком, и текстом для скринридера: по одной
 *   звёздочке о ней нельзя узнать ни при дальтонизме, ни на слух.
 * • Подсказка и ошибка НЕ показываются одновременно: пока ошибка есть,
 *   единственное, что нужно прочитать, — это она.
 */

interface FieldShellProps {
	id: string;
	label: string;
	/** Поле обязательно к заполнению. */
	required?: boolean;
	/** Явная пометка «необязательно» — там, где это неочевидно. */
	optionalNote?: string;
	error?: string;
	hint?: ReactNode;
	children: ReactNode;
	className?: string;
}

export function FieldShell({
	id,
	label,
	required,
	optionalNote,
	error,
	hint,
	children,
	className,
}: FieldShellProps) {
	return (
		<div
			className={className ? `${styles.field} ${className}` : styles.field}
			data-invalid={error ? "true" : undefined}
		>
			<label htmlFor={id} className={styles.fieldLabel}>
				<span className={styles.fieldLabelText}>
					{label}
					{required && (
						<span className={styles.required} aria-hidden>
							*
						</span>
					)}
					{required && <span className="sr-only"> (обязательное поле)</span>}
				</span>
				{!required && optionalNote && (
					<span className={styles.optional}>{optionalNote}</span>
				)}
			</label>

			<div className={styles.fieldBox}>{children}</div>

			{error ? (
				<p id={`${id}-error`} role="alert" className={styles.fieldError}>
					<AlertCircle
						size={13}
						aria-hidden
						className={styles.fieldErrorIcon}
					/>
					{error}
				</p>
			) : hint ? (
				<p id={`${id}-hint`} className={styles.fieldNote}>
					{hint}
				</p>
			) : null}
		</div>
	);
}

/** Как связать сообщение с полем: ошибка важнее подсказки. */
export function describedBy(
	id: string,
	error?: string,
	hint?: ReactNode,
): string | undefined {
	if (error) return `${id}-error`;
	if (hint) return `${id}-hint`;
	return undefined;
}

type InputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"id" | "className"
>;

interface TextFieldProps extends InputProps {
	/** id обязателен, когда поле участвует в общем списке ошибок. */
	id?: string;
	label: string;
	error?: string;
	hint?: ReactNode;
	optionalNote?: string;
	leftIcon?: ReactNode;
	/** Кнопка или индикатор справа внутри строки поля. */
	rightSlot?: ReactNode;
	/** Табличные цифры — для номеров, индексов, ИНН. */
	numeric?: boolean;
	className?: string;
	inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
	id,
	label,
	error,
	hint,
	optionalNote,
	leftIcon,
	rightSlot,
	numeric,
	className,
	inputRef,
	required,
	...rest
}: TextFieldProps) {
	const generatedId = useId();
	const fieldId = id ?? generatedId;

	return (
		<FieldShell
			id={fieldId}
			label={label}
			required={required}
			optionalNote={optionalNote}
			error={error}
			hint={hint}
			className={className}
		>
			{leftIcon && (
				<span className={styles.fieldIcon} aria-hidden>
					{leftIcon}
				</span>
			)}
			<input
				{...rest}
				ref={inputRef}
				id={fieldId}
				required={required}
				className={
					numeric
						? `${styles.control} ${styles.controlNumeric}`
						: styles.control
				}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy(fieldId, error, hint)}
			/>
			{rightSlot}
		</FieldShell>
	);
}

type SelectProps = Omit<
	SelectHTMLAttributes<HTMLSelectElement>,
	"id" | "className"
>;

interface SelectFieldProps extends SelectProps {
	id?: string;
	label: string;
	error?: string;
	hint?: ReactNode;
	children: ReactNode;
	className?: string;
}

/**
 * Нативный `<select>`.
 *
 * Нативный — намеренно: на телефоне он открывает системный барабан, к
 * которому привык палец, а список перевозчиков бывает в три десятка строк.
 * Свой выпадающий список пришлось бы учить всему, что этот умеет из коробки:
 * клавиатуре, поиску набором, экранной лупе.
 */
export function SelectField({
	id,
	label,
	error,
	hint,
	children,
	className,
	required,
	...rest
}: SelectFieldProps) {
	const generatedId = useId();
	const fieldId = id ?? generatedId;

	return (
		<FieldShell
			id={fieldId}
			label={label}
			required={required}
			error={error}
			hint={hint}
			className={className}
		>
			<span className={styles.selectBox}>
				<select
					{...rest}
					id={fieldId}
					required={required}
					className={styles.select}
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy(fieldId, error, hint)}
				>
					{children}
				</select>
				<ChevronDown size={16} aria-hidden className={styles.selectChevron} />
			</span>
		</FieldShell>
	);
}

type TextareaProps = Omit<
	TextareaHTMLAttributes<HTMLTextAreaElement>,
	"id" | "className"
>;

interface TextareaFieldProps extends TextareaProps {
	id?: string;
	label: string;
	error?: string;
	hint?: ReactNode;
	optionalNote?: string;
	className?: string;
}

export function TextareaField({
	id,
	label,
	error,
	hint,
	optionalNote,
	className,
	required,
	...rest
}: TextareaFieldProps) {
	const generatedId = useId();
	const fieldId = id ?? generatedId;

	return (
		<FieldShell
			id={fieldId}
			label={label}
			required={required}
			optionalNote={optionalNote}
			error={error}
			hint={hint}
			className={className}
		>
			<textarea
				{...rest}
				id={fieldId}
				required={required}
				className={`${styles.control} ${styles.textarea}`}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy(fieldId, error, hint)}
			/>
		</FieldShell>
	);
}

interface CheckboxRowProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: ReactNode;
	/** Пояснение под подписью — зачем этот флажок. */
	note?: ReactNode;
	disabled?: boolean;
}

export function CheckboxRow({
	checked,
	onChange,
	children,
	note,
	disabled,
}: CheckboxRowProps) {
	return (
		// Подпись обёрнута вокруг поля: вся строка становится целью нажатия, и
		// связь label ↔ input не зависит от совпадения id.
		<label className={styles.checkbox}>
			<input
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onChange(event.target.checked)}
				className={styles.checkboxInput}
			/>
			<span className={styles.checkboxBody}>
				<span className={styles.checkboxLabel}>{children}</span>
				{note && <span className={styles.checkboxNote}>{note}</span>}
			</span>
		</label>
	);
}

interface DisclosureProps {
	open: boolean;
	children: ReactNode;
}

/**
 * Раскрытие по высоте.
 *
 * Свёрнутое содержимое помечено `inert`: иначе скрытое поле остаётся в
 * порядке табуляции и в дереве доступности — то есть существует для всех,
 * кроме тех, кто смотрит на экран.
 */
export function Disclosure({ open, children }: DisclosureProps) {
	return (
		<div
			className={styles.disclosure}
			data-open={open || undefined}
			inert={!open}
		>
			<div className={styles.disclosureInner}>{children}</div>
		</div>
	);
}
