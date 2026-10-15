"use client";

import { useOAuthProviders } from "./OAuthProvidersContext";

interface YandexIdButtonProps {
	/** Куда вернуть после входа; проверяется на сервере (returnPath.ts). */
	next?: string | null;
	/** link — привязка из кабинета вошедшим покупателем. */
	intent?: "login" | "link";
	label?: string;
	disabled?: boolean;
}

/**
 * Кнопка «Войти с Яндекс ID».
 *
 * Обычная ссылка на /auth/yandex/start, не кнопка с обработчиком: переход на
 * oauth.yandex.ru — навигация, и она должна работать до гидрации.
 *
 * Оформление — по правилам Яндекса для кнопок входа: чёрная кнопка, знак «Я»
 * в красном круге, текст «Войти с Яндекс ID». Цвета брендовые и от темы сайта
 * не зависят. Цвет текста на <a> — с `!`: глобальное правило Once UI
 * `a:not(.button){color}` сильнее утилит Tailwind.
 */
export function YandexIdButton({
	next,
	intent = "login",
	label = "Войти с Яндекс ID",
	disabled = false,
}: YandexIdButtonProps) {
	const { yandex } = useOAuthProviders();
	if (!yandex) return null;

	const params = new URLSearchParams();
	if (next) params.set("next", next);
	if (intent === "link") params.set("intent", "link");
	const query = params.toString();
	const href = `/auth/yandex/start${query ? `?${query}` : ""}`;

	return (
		<a
			href={disabled ? undefined : href}
			aria-disabled={disabled || undefined}
			className={
				"flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--radius-m,10px)] " +
				"bg-[#000] px-4 text-[15px] font-medium !text-white no-underline transition-opacity " +
				"hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 " +
				"focus-visible:outline-[var(--accent)] aria-disabled:pointer-events-none aria-disabled:opacity-50"
			}
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 22 22"
				aria-hidden="true"
				focusable="false"
			>
				<circle cx="11" cy="11" r="11" fill="#FC3F1D" />
				<path
					d="M12.4 17.4h2.2V4.6h-3.2c-3.2 0-4.9 1.6-4.9 4.1 0 2 1 3.1 2.7 4.3l-3 4.4h2.4l3.3-4.9-1.1-.8c-1.4-.9-2-1.7-2-3.2 0-1.4.9-2.3 2.7-2.3h.9v11.2z"
					fill="#fff"
				/>
			</svg>
			<span>{label}</span>
		</a>
	);
}

/** Разделитель «или» между кнопкой сервиса и формой. */
export function OAuthDivider() {
	const { yandex } = useOAuthProviders();
	if (!yandex) return null;
	return (
		<div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
			<span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
			или
			<span className="h-px flex-1 bg-[var(--border)]" aria-hidden="true" />
		</div>
	);
}
