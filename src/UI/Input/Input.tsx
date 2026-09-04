// src/UI/Input/Input.tsx
"use client";

import {
	AlertCircle,
	AlertTriangle,
	CheckCircle,
	Eye,
	EyeOff,
	type LucideIcon,
} from "lucide-react";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "@/utils/cn";
import { inputStyles } from "./Input.styles";
import type { AdvancedInputProps } from "./Input.types";

const statusIcons: Record<string, LucideIcon> = {
	error: AlertCircle,
	success: CheckCircle,
	warning: AlertTriangle,
};

const statusIconColors: Record<string, string> = {
	error: "text-[var(--error)]",
	success: "text-[var(--success)]",
	warning: "text-[var(--warning)]",
};

export function Input(props: AdvancedInputProps) {
	const {
		label,
		helperText,
		errorMessage,
		status = errorMessage ? "error" : "default",
		leftIcon,
		rightIcon,
		size = "md",
		fullWidth = true,
		wrapperClassName,
		className,
		multiline, // исключаем из rest
		revealPassword = true,
		...rest
	} = props;

	// ref владельца поля объединяется с внутренним, а не подменяет его:
	// внутренний нужен кнопке «показать пароль» (поиск родительской формы),
	// внешний — управлению фокусом снаружи.
	const forwardedRef = (rest as { ref?: React.Ref<HTMLInputElement> }).ref;
	if ("ref" in rest) delete (rest as { ref?: unknown }).ref;

	const handleAutoResize = useCallback(
		(e: ChangeEvent<HTMLTextAreaElement>) => {
			const el = e.currentTarget;
			el.style.height = "auto";
			el.style.height = `${el.scrollHeight}px`;
			if ("onChange" in rest && rest.onChange) {
				(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>).onChange?.(
					e,
				);
			}
		},
		[rest],
	);

	// ── Показ/скрытие пароля ───────────────────────────────────────────────────
	// Без этого поле пароля нельзя перепроверить глазами: единственный способ
	// убедиться, что опечатки нет, — отправить форму и получить ошибку. Живёт
	// в самом примитиве, а не в отдельном компоненте, чтобы поведение было
	// одинаковым во всех формах проекта (вход, регистрация, сброс пароля,
	// смена пароля в профиле, удаление аккаунта).
	const [isRevealed, setIsRevealed] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Сброс формы обязан снова замаскировать пароль. React сбрасывает поля после
	// каждого Server Action (см. AuthFormValues), и без этого поле оставалось бы
	// раскрытым: сам сброс ничего не показывает — поле пустое, — но СЛЕДУЮЩИЙ
	// пароль пользователь набирал бы открытым текстом, не заметив этого.
	// Слушаем нативное событие reset формы: у неуправляемого поля это
	// единственный сигнал о сбросе (change при form.reset() не возникает).
	useEffect(() => {
		const form = inputRef.current?.form;
		if (!form) return;

		const handleReset = () => setIsRevealed(false);
		form.addEventListener("reset", handleReset);
		return () => form.removeEventListener("reset", handleReset);
	}, []);
	const inputType = (rest as React.InputHTMLAttributes<HTMLInputElement>).type;
	const isPassword = !multiline && inputType === "password";
	const hasReveal = isPassword && revealPassword;
	// Раскрытое поле — это уже не type="password": менеджеры паролей и
	// автозаполнение продолжают работать по name/autoComplete, а браузер
	// перестаёт маскировать символы.
	const resolvedType = hasReveal && isRevealed ? "text" : inputType;

	const resolvedStatus = status;
	const StatusIcon =
		resolvedStatus !== "default" ? statusIcons[resolvedStatus] : null;
	// У поля пароля правый слот занимает кнопка-глазок: два значка подряд в
	// одном углу читаются как мусор, а ошибка и так видна по рамке и тексту
	// под полем.
	const resolvedRightIcon = hasReveal
		? null
		: (rightIcon ??
			(StatusIcon ? (
				<StatusIcon
					className={cn("h-4 w-4", statusIconColors[resolvedStatus])}
					aria-hidden
				/>
			) : null));

	const reactId = useId();
	const controlId =
		(rest as React.InputHTMLAttributes<HTMLInputElement>).id ?? reactId;
	const helpText = errorMessage || helperText;
	const helpId = helpText ? `${controlId}-help` : undefined;
	const helpColor = errorMessage
		? "text-[var(--error)]"
		: "text-[var(--text-secondary)]";

	const inputClass = inputStyles(
		size,
		resolvedStatus,
		!!leftIcon,
		!!resolvedRightIcon || hasReveal,
		className,
	);

	const a11yProps = {
		id: controlId,
		"aria-invalid": resolvedStatus === "error" ? true : undefined,
		"aria-describedby": helpId,
	};

	return (
		<div
			className={cn(
				"flex flex-col gap-1.5",
				!fullWidth && "w-fit",
				wrapperClassName,
			)}
		>
			{label && (
				<label
					htmlFor={controlId}
					className="text-sm font-medium text-[var(--text-primary)] leading-none"
				>
					{label}
				</label>
			)}

			<div className={cn("relative", fullWidth ? "w-full" : "w-fit")}>
				{leftIcon && (
					<span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none flex items-center">
						{leftIcon}
					</span>
				)}

				{multiline ? (
					<textarea
						{...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
						{...a11yProps}
						rows={(rest as { rows?: number }).rows ?? 3}
						className={cn(inputClass, "h-auto py-2.5 resize-none")}
						onChange={
							(rest as { autoResize?: boolean }).autoResize
								? handleAutoResize
								: (rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)
										.onChange
						}
					/>
				) : (
					<input
						{...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
						{...a11yProps}
						ref={(node) => {
							inputRef.current = node;
							if (typeof forwardedRef === "function") forwardedRef(node);
							else if (forwardedRef) forwardedRef.current = node;
						}}
						type={resolvedType}
						className={inputClass}
					/>
				)}

				{hasReveal && (
					<button
						type="button"
						onClick={() => setIsRevealed((prev) => !prev)}
						// Кнопка остаётся в табуляции: пользователю без мыши нужен доступ
						// к переключателю ровно так же, как и остальным. aria-pressed
						// сообщает скринридеру текущее состояние, aria-controls связывает
						// кнопку с полем, на которое она влияет.
						aria-label={isRevealed ? "Скрыть пароль" : "Показать пароль"}
						aria-pressed={isRevealed}
						aria-controls={controlId}
						title={isRevealed ? "Скрыть пароль" : "Показать пароль"}
						disabled={
							(rest as React.InputHTMLAttributes<HTMLInputElement>).disabled
						}
						className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] transition-[color,background-color,transform] duration-150 ease-out hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] active:scale-90 disabled:pointer-events-none disabled:opacity-40"
					>
						{isRevealed ? (
							<EyeOff className="h-4 w-4" aria-hidden />
						) : (
							<Eye className="h-4 w-4" aria-hidden />
						)}
					</button>
				)}

				{resolvedRightIcon && (
					<span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
						{resolvedRightIcon}
					</span>
				)}
			</div>

			{helpText && (
				<p id={helpId} className={cn("text-xs leading-none", helpColor)}>
					{helpText}
				</p>
			)}
		</div>
	);
}

export default Input;
