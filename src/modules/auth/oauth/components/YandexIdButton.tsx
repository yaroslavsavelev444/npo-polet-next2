"use client";

import { useOAuthProviders } from "./OAuthProvidersContext";
import { YandexIdMark } from "./YandexIdMark";

interface YandexIdButtonProps {
	/** Куда вернуть после входа; проверяется на сервере (returnPath.ts). */
	next?: string | null;
	/** link — привязка из кабинета вошедшим покупателем. */
	intent?: "login" | "link";
	/**
	 * Правила Яндекса запрещают менять текст кнопки — есть только два
	 * варианта: полный «Войти с Яндекс ID» и короткий «Яндекс ID» (когда
	 * полный не помещается или рядом своя подпись, как «Привязать вход» в
	 * кабинете). Своего текста кнопка не принимает намеренно.
	 */
	variant?: "full" | "short";
	disabled?: boolean;
}

/**
 * Кнопка «Войти с Яндекс ID».
 *
 * Обычная ссылка на /auth/yandex/start, не кнопка с обработчиком: переход на
 * oauth.yandex.ru — навигация, и она должна работать до гидрации.
 *
 * Оформление — по правилам Яндекса для кнопок входа
 * (https://yandex.ru/dev/id/doc/ru/codes/buttons-design): основная версия,
 * чёрная, размер M (44 px), знак «Я» в красном круге. Цвет, обводку, текст,
 * значок и отступы менять нельзя — от темы сайта они не зависят. Цвет текста на <a> — с `!`: глобальное правило Once UI
 * `a:not(.button){color}` сильнее утилит Tailwind.
 */
export function YandexIdButton({
	next,
	intent = "login",
	variant = "full",
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
				// Геометрия — из макета Яндекса (M: высота 44, скругление 12, знак
				// 24, до текста ~13 px, текст 16 px); от токенов сайта не зависит.
				"flex h-11 w-full items-center justify-center gap-3 rounded-[12px] " +
				"bg-[#000] px-4 text-base font-medium !text-white no-underline transition-opacity " +
				"hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 " +
				"focus-visible:outline-[var(--accent)] aria-disabled:pointer-events-none aria-disabled:opacity-50"
			}
		>
			<YandexIdMark />
			<span>{variant === "full" ? "Войти с Яндекс ID" : "Яндекс ID"}</span>
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
