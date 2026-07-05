// src/UI/Input/Input.tsx
"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { type ChangeEvent, useCallback } from "react";
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
    ...rest
  } = props;

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

  const resolvedStatus = status;
  const StatusIcon =
    resolvedStatus !== "default" ? statusIcons[resolvedStatus] : null;
  const resolvedRightIcon =
    rightIcon ??
    (StatusIcon ? (
      <StatusIcon
        className={cn("h-4 w-4", statusIconColors[resolvedStatus])}
        aria-hidden
      />
    ) : null);

  const inputClass = inputStyles(
    size,
    resolvedStatus,
    !!leftIcon,
    !!resolvedRightIcon,
    className,
  );
  const helpText = errorMessage || helperText;
  const helpColor = errorMessage
    ? "text-[var(--error)]"
    : "text-[var(--text-secondary)]";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        !fullWidth && "w-fit",
        wrapperClassName,
      )}
    >
      {label && (
        <label className="text-sm font-medium text-[var(--text-primary)] leading-none">
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
            className={inputClass}
          />
        )}

        {resolvedRightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            {resolvedRightIcon}
          </span>
        )}
      </div>

      {helpText && (
        <p className={cn("text-xs leading-none", helpColor)}>{helpText}</p>
      )}
    </div>
  );
}

export default Input;
