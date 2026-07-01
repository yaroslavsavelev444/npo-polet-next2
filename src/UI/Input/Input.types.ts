import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export type InputStatus = 'default' | 'error' | 'success' | 'warning';

export interface BaseInputProps {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  status?: InputStatus;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  wrapperClassName?: string;
  className?: string;
  /** Если `true` – рендерится `<textarea>`, иначе `<input>` */
  multiline?: boolean;
  /** Автоматический ресайз для textarea (работает только при `multiline: true`) */
  autoResize?: boolean;
}

/**
 * Расширяет пропсы нативного `<input>` или `<textarea>`,
 * но исключает конфликтующие поля (например, `size` уже определён в `BaseInputProps`).
 */
export type AdvancedInputProps = BaseInputProps &
  (
    | (Omit<InputHTMLAttributes<HTMLInputElement>, keyof BaseInputProps> & { multiline?: false })
    | (Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof BaseInputProps> & { multiline: true })
  );