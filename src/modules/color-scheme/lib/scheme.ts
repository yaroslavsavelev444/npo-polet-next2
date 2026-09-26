/**
 * Тема оформления: выбор посетителя и как он хранится.
 *
 * Три значения, а не два. «Авто» — это отсутствие выбора: тема следует за
 * настройкой системы, и её разрешает сам CSS (color-scheme: light dark в
 * app/(frontend)/theme.css), без JavaScript и без мигания при загрузке.
 * Явный выбор — атрибут data-scheme на <html> плюс cookie, по которой сервер
 * выставляет тот же атрибут уже в первом HTML (app/(frontend)/layout.tsx).
 *
 * Cookie, а не localStorage: localStorage сервер не видит, и страница
 * посетителя, выбравшего светлую тему при тёмной системе, приходила бы
 * тёмной и перекрашивалась после гидратации.
 *
 * Модуль без "use client" и без обращений к document на верхнем уровне —
 * его импортирует и серверный layout, и клиентские компоненты.
 */

export const SCHEME_COOKIE = "scheme";

export type SchemePreference = "auto" | "light" | "dark";
export type Scheme = "light" | "dark";

export function parseSchemePreference(
	value: string | null | undefined,
): SchemePreference {
	return value === "light" || value === "dark" ? value : "auto";
}
