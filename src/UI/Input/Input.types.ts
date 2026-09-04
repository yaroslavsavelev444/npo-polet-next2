import type {
	InputHTMLAttributes,
	ReactNode,
	Ref,
	TextareaHTMLAttributes,
} from "react";

export type InputStatus = "default" | "error" | "success" | "warning";

export interface BaseInputProps {
	label?: string;
	helperText?: string;
	errorMessage?: string;
	status?: InputStatus;
	leftIcon?: ReactNode;
	rightIcon?: ReactNode;
	size?: "sm" | "md" | "lg";
	fullWidth?: boolean;
	wrapperClassName?: string;
	className?: string;
	/** Если `true` – рендерится `<textarea>`, иначе `<input>` */
	multiline?: boolean;
	/** Автоматический ресайз для textarea (работает только при `multiline: true`) */
	autoResize?: boolean;
	/**
	 * Кнопка «показать пароль» у полей с `type="password"`. Включена по
	 * умолчанию — выключать стоит только там, где раскрытие содержимого
	 * действительно недопустимо (например, поле видно на общем экране).
	 */
	revealPassword?: boolean;
}

/**
 * Расширяет пропсы нативного `<input>` или `<textarea>`,
 * но исключает конфликтующие поля (например, `size` уже определён в `BaseInputProps`).
 */
export type AdvancedInputProps = BaseInputProps &
	(
		| (Omit<InputHTMLAttributes<HTMLInputElement>, keyof BaseInputProps> & {
				multiline?: false;
				/**
				 * Ссылка на сам `<input>`. Нужна там, где владелец поля обязан им
				 * управлять: возврат фокуса в поле адреса после выбора подсказки,
				 * фокус на первое поле с ошибкой после неудачной отправки формы.
				 * Компонент использует ref и внутри (кнопка «показать пароль»),
				 * поэтому переданный ref объединяется с внутренним, а не заменяет его.
				 */
				ref?: Ref<HTMLInputElement>;
		  })
		| (Omit<
				TextareaHTMLAttributes<HTMLTextAreaElement>,
				keyof BaseInputProps
		  > & { multiline: true })
	);
