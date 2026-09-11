"use client";

import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react";
import {
	type InputHTMLAttributes,
	type ReactNode,
	useId,
	useState,
} from "react";
import styles from "./Profile.module.css";

/**
 * Поля форм кабинета.
 *
 * Своя разметка, а не UI/Input, по той же причине, по которой её завела форма
 * обратной связи на контактах: у примитива коробка с заливкой --input-bg,
 * скруглением и кольцом focus:ring — материал прежней версии витрины. В
 * обновлённой системе поле — это строка с подчёркиванием, по которой при
 * фокусе прочерчивается акцент.
 *
 * Трогать сам UI/Input нельзя: он стоит в форме входа, регистрации, сброса
 * пароля и оформления заказа, и смена его вида — отдельная задача про эти
 * страницы, а не про кабинет.
 *
 * Здесь ровно три составляющие: обёртка с подписью и сообщением об ошибке,
 * обычное поле и поле пароля с кнопкой показа. Больше в кабинете не нужно.
 */

interface FieldProps {
	id: string;
	label: string;
	/** Приписка справа от подписи — «нельзя изменить», счётчик. */
	labelNote?: ReactNode;
	error?: string;
	hint?: ReactNode;
	/** Поле только для чтения: подчёркивание пунктиром, прочерк отключён. */
	locked?: boolean;
	children: ReactNode;
}

export function Field({
	id,
	label,
	labelNote,
	error,
	hint,
	locked,
	children,
}: FieldProps) {
	return (
		<div
			className={styles.field}
			data-invalid={error ? "true" : undefined}
			data-locked={locked ? "true" : undefined}
		>
			{/* Подпись набрана моноширинным капслоком — тем же служебным голосом,
			    что и остальные технические подписи на сайте (индексы разделов,
			    сводка выдачи каталога). */}
			<label htmlFor={id} className={styles.fieldLabel}>
				<span>{label}</span>
				{labelNote ? <span>{labelNote}</span> : null}
			</label>

			<div className={styles.fieldBox}>{children}</div>

			{error ? (
				<p id={`${id}-error`} role="alert" className={styles.fieldError}>
					<AlertCircle size={13} aria-hidden className="mt-[0.1rem] shrink-0" />
					{error}
				</p>
			) : hint ? (
				<div id={`${id}-hint`} className={styles.fieldNote}>
					{hint}
				</div>
			) : null}
		</div>
	);
}

type ControlProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "size">;

interface TextFieldProps extends ControlProps {
	label: string;
	labelNote?: ReactNode;
	error?: string;
	hint?: ReactNode;
	locked?: boolean;
	/** Значок слева от значения — для справочных полей вроде почты. */
	icon?: ReactNode;
}

export function TextField({
	label,
	labelNote,
	error,
	hint,
	locked,
	icon,
	...rest
}: TextFieldProps) {
	const id = useId();

	return (
		<Field
			id={id}
			label={label}
			labelNote={labelNote}
			error={error}
			hint={hint}
			locked={locked}
		>
			{icon ? (
				<span className={styles.fieldIcon} aria-hidden>
					{icon}
				</span>
			) : null}
			<input
				{...rest}
				id={id}
				className={styles.control}
				aria-invalid={error ? true : undefined}
				aria-describedby={
					error ? `${id}-error` : hint ? `${id}-hint` : undefined
				}
			/>
			{locked ? (
				<span className={styles.fieldIcon} aria-hidden>
					<Lock size={14} />
				</span>
			) : null}
		</Field>
	);
}

interface PasswordFieldProps extends ControlProps {
	label: string;
	error?: string;
	hint?: ReactNode;
}

/**
 * Поле пароля с показом значения.
 *
 * Без него единственный способ проверить, что опечатки нет, — отправить форму
 * и получить ошибку. Кнопка остаётся в обходе табом: пользователю без мыши
 * переключатель нужен ровно так же, aria-pressed сообщает текущее состояние,
 * aria-controls связывает кнопку с полем.
 *
 * Раскрытое поле — это уже не type="password": менеджеры паролей продолжают
 * работать по name/autoComplete, а браузер перестаёт маскировать символы.
 */
export function PasswordField({
	label,
	error,
	hint,
	disabled,
	...rest
}: PasswordFieldProps) {
	const id = useId();
	const [revealed, setRevealed] = useState(false);

	return (
		<Field id={id} label={label} error={error} hint={hint}>
			<input
				{...rest}
				id={id}
				type={revealed ? "text" : "password"}
				disabled={disabled}
				className={styles.control}
				aria-invalid={error ? true : undefined}
				aria-describedby={
					error ? `${id}-error` : hint ? `${id}-hint` : undefined
				}
			/>
			<button
				type="button"
				onClick={() => setRevealed((value) => !value)}
				disabled={disabled}
				aria-label={revealed ? "Скрыть пароль" : "Показать пароль"}
				aria-pressed={revealed}
				aria-controls={id}
				className={styles.fieldToggle}
			>
				{revealed ? (
					<EyeOff size={16} aria-hidden />
				) : (
					<Eye size={16} aria-hidden />
				)}
			</button>
		</Field>
	);
}
