"use client";

/**
 * Перевод фокуса к полю формы по его id.
 *
 * Отдельная функция, а не пара строк по месту, потому что «увести к полю»
 * состоит из трёх разных вещей, и пропуск любой ломает сценарий:
 *  1. элемент может быть не полем ввода, а контейнером (группа радио-кнопок,
 *     список пунктов самовывоза) — тогда фокусируем первый интерактивный
 *     элемент внутри;
 *  2. поле может быть за пределами экрана — нужен скролл с учётом липкой
 *     шапки, иначе фокус уедет под неё;
 *  3. пользователь мог просить уменьшенную анимацию — уважаем prefers-reduced-motion.
 */

/** Высота липкой шапки задана переменной темы; запас — чтобы поле не липло. */
const SCROLL_OFFSET_FALLBACK = 96;
const EXTRA_GAP = 24;

function resolveFocusable(element: HTMLElement): HTMLElement {
	if (
		element instanceof HTMLInputElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLButtonElement
	) {
		return element;
	}
	const inner = element.querySelector<HTMLElement>(
		'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
	);
	return inner ?? element;
}

export function focusCheckoutField(elementId: string): boolean {
	if (typeof document === "undefined" || !elementId) return false;

	const container = document.getElementById(elementId);
	if (!container) return false;

	const target = resolveFocusable(container);

	const headerHeight = Number.parseInt(
		getComputedStyle(document.documentElement).getPropertyValue(
			"--sticky-header-height",
		),
		10,
	);
	const offset =
		(Number.isFinite(headerHeight) ? headerHeight : SCROLL_OFFSET_FALLBACK) +
		EXTRA_GAP;

	const prefersReducedMotion = window.matchMedia?.(
		"(prefers-reduced-motion: reduce)",
	).matches;

	const top = container.getBoundingClientRect().top + window.scrollY - offset;
	window.scrollTo({
		top: Math.max(top, 0),
		behavior: prefersReducedMotion ? "auto" : "smooth",
	});

	// preventScroll: скролл уже выполнен выше с учётом шапки, а браузерный
	// скролл при фокусе поставил бы поле вплотную к верхней границе окна —
	// то есть под липкую шапку.
	target.focus({ preventScroll: true });
	return true;
}
