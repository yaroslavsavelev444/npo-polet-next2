/**
 * Подстановка переменных в заготовку ответа: {{имя}}, {{менеджер}},
 * {{номерЗаказа}}. Выполняется в консоли при вставке — менеджер видит
 * готовый текст и может поправить его до отправки.
 *
 * Текст — простой, не HTML: «экранировать» нечего, но незаполненная
 * переменная не должна доехать до покупателя скобками. Она убирается, а
 * консоль показывает менеджеру, чего не хватило.
 */

export interface CannedVariables {
	имя?: string | null;
	менеджер?: string | null;
	номерЗаказа?: string | null;
}

export const CANNED_VARIABLES = ["имя", "менеджер", "номерЗаказа"] as const;

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export function renderCannedBody(
	template: string,
	variables: CannedVariables,
): { text: string; missing: string[] } {
	const missing = new Set<string>();
	const text = template
		.replace(PLACEHOLDER, (_, name: string) => {
			const value = (variables as Record<string, string | null | undefined>)[
				name
			];
			if (value?.trim()) return value.trim();
			missing.add(name);
			return "";
		})
		// Пустая подстановка оставляет двойные пробелы и пробел перед знаком.
		.replace(/[ \t]{2,}/g, " ")
		.replace(/ +([,.!?;:])/g, "$1")
		.trim();
	return { text, missing: [...missing] };
}
