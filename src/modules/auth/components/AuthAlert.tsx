import {
	AlertCircle,
	Ban,
	CheckCircle2,
	Clock,
	type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";
import type { AuthErrorCode } from "../types";

type Severity = "error" | "warning" | "success";

interface AuthAlertProps {
	message: string;
	code?: AuthErrorCode;
	/** Явно задаёт вид баннера (например, успех повторной отправки кода), в обход code → severity маппинга. */
	severity?: Severity;
	className?: string;
}

const CODE_SEVERITY: Partial<Record<AuthErrorCode, Severity>> = {
	account_locked: "warning",
	rate_limited: "warning",
};

const CODE_ICON: Partial<Record<AuthErrorCode, LucideIcon>> = {
	account_locked: Clock,
	rate_limited: Clock,
	account_blocked: Ban,
	account_suspended: Ban,
};

const SEVERITY_STYLES: Record<Severity, string> = {
	error: "bg-[var(--error)]/10 border-[var(--error)]/30 text-[var(--error)]",
	warning:
		"bg-[var(--warning)]/10 border-[var(--warning)]/30 text-[var(--warning)]",
	success:
		"bg-[var(--success)]/10 border-[var(--success)]/30 text-[var(--success)]",
};

const SEVERITY_ICON_STYLES: Record<Severity, string> = {
	error: "text-[var(--error)]",
	warning: "text-[var(--warning)]",
	success: "text-[var(--success)]",
};

const SEVERITY_ICON: Record<Severity, LucideIcon> = {
	error: AlertCircle,
	warning: Clock,
	success: CheckCircle2,
};

/**
 * Общий баннер ошибки/успеха для форм логина/регистрации. Разные AuthErrorCode
 * получают разное оформление (иконка + цвет), чтобы, например, временную
 * блокировку аккаунта или превышение rate-limit нельзя было спутать с
 * обычной "неверный пароль" — не читая текст целиком.
 */
export function AuthAlert({
	message,
	code,
	severity,
	className,
}: AuthAlertProps) {
	const resolvedSeverity = severity ?? (code && CODE_SEVERITY[code]) ?? "error";
	const Icon = severity
		? SEVERITY_ICON[severity]
		: ((code && CODE_ICON[code]) ?? AlertCircle);

	return (
		<div
			role="alert"
			className={cn(
				"flex items-start gap-2 rounded-[var(--radius-sm)] border p-3 text-sm",
				"animate-[fade-in-up_200ms_ease-out]",
				SEVERITY_STYLES[resolvedSeverity],
				className,
			)}
		>
			<Icon
				className={cn(
					"h-4 w-4 mt-0.5 shrink-0",
					SEVERITY_ICON_STYLES[resolvedSeverity],
				)}
				aria-hidden
			/>
			<span className="text-[var(--text-primary)]">{message}</span>
		</div>
	);
}
