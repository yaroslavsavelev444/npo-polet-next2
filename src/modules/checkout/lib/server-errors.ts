import type { CheckoutFieldErrors } from "./checkout-schema";

/**
 * Отсев устаревших серверных ошибок.
 *
 * Клиентские ошибки пересчитываются на каждый рендер и устареть не могут.
 * Серверные — могут: сообщение «Организация не найдена» относится к тому
 * значению, которое было отправлено, и обязано исчезнуть, как только
 * пользователь это значение изменил. Иначе форма показывает ошибку,
 * которой уже нет, и пользователь не понимает, что ещё от него хотят.
 *
 * Вынесено из хука отдельной чистой функцией: это единственное правило
 * «живучести» ошибок в форме, и оно должно проверяться тестом, а не
 * рендерингом компонента.
 */
export function filterStaleServerErrors<T>(
	serverErrors: CheckoutFieldErrors,
	submittedSnapshot: T | null,
	currentValue: T,
): CheckoutFieldErrors {
	if (!submittedSnapshot) return {};

	const live: CheckoutFieldErrors = {};
	for (const [path, message] of Object.entries(serverErrors)) {
		if (
			getValueAtPath(currentValue, path) ===
			getValueAtPath(submittedSnapshot, path)
		) {
			live[path] = message;
		}
	}
	return live;
}

/** Достаёт значение по пути `a.b.c`; undefined, если пути нет. */
export function getValueAtPath(source: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(current, key) =>
				current && typeof current === "object"
					? (current as Record<string, unknown>)[key]
					: undefined,
			source,
		);
}
