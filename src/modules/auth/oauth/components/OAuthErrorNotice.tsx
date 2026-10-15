"use client";

import { useSearchParams } from "next/navigation";
import { AuthAlert } from "../../components/AuthAlert";
import type { AuthErrorCode } from "../../types";
import type { OAuthErrorCode } from "../types";

/**
 * Сообщение о неудачном входе через Яндекс ID — по коду из `?oauth_error=`,
 * который ставит callback (app/(frontend)/auth/yandex/callback/route.ts).
 * В адресе только код; текст — здесь.
 */
const MESSAGES: Record<
	OAuthErrorCode,
	{ text: string; code?: AuthErrorCode; severity?: "warning" }
> = {
	// «Отменено» — не ошибка, а предупреждение: человек сам нажал «Отмена».
	cancelled: { text: "Вход через Яндекс ID отменён.", severity: "warning" },
	expired: { text: "Время входа истекло. Попробуйте ещё раз." },
	unavailable: {
		text: "Яндекс ID сейчас не отвечает. Попробуйте позже или войдите по почте.",
	},
	no_email: {
		text: "В вашем Яндекс ID не указана почта, а без неё мы не сможем присылать письма о заказах. Добавьте почту в Яндексе или зарегистрируйтесь по почте.",
	},
	account_blocked: {
		text: "Ваш аккаунт заблокирован. Обратитесь в поддержку.",
		code: "account_blocked",
	},
	account_suspended: {
		text: "Ваш аккаунт приостановлен. Обратитесь в поддержку.",
		code: "account_suspended",
	},
	already_linked_elsewhere: {
		text: "Этот Яндекс ID уже привязан к другому аккаунту на нашем сайте.",
	},
	rate_limited: {
		text: "Слишком много попыток. Попробуйте позже.",
		code: "rate_limited",
	},
	generic: { text: "Не удалось войти через Яндекс ID. Попробуйте ещё раз." },
};

export function OAuthErrorNotice({ className }: { className?: string }) {
	const searchParams = useSearchParams();
	const raw = searchParams.get("oauth_error");
	if (!raw || !Object.hasOwn(MESSAGES, raw)) return null;
	const { text, code, severity } = MESSAGES[raw as OAuthErrorCode];
	return (
		<AuthAlert
			message={text}
			code={code}
			severity={severity}
			className={className}
		/>
	);
}
