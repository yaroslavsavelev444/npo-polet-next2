"use client";

import type { AddressSuggestion } from "../types";
import { type UseSuggestionsResult, useSuggestions } from "./useSuggestions";

/**
 * Подсказки адреса. Параметры подобраны под реальный ввод адреса:
 *
 *  • debounce 250 мс — короче средней паузы между словами, но длиннее паузы
 *    между символами: при обычном темпе набора «москва ленина 10» уходит 3–4
 *    запроса вместо 17;
 *  • минимум 3 символа — по одной-двум буквам DaData возвращает шум, а квота
 *    расходуется.
 *
 * Загрузка, отмена и кэш — в useSuggestions.
 */

const DEBOUNCE_MS = 250;
export const MIN_QUERY_LENGTH = 3;

export type { SuggestionsStatus } from "./useSuggestions";
export type UseAddressSuggestionsResult =
	UseSuggestionsResult<AddressSuggestion>;

interface Options {
	query: string;
	/** Выключает загрузку (например, поле не в фокусе или адрес уже выбран). */
	enabled?: boolean;
	/** `city` — подсказки только по городам. */
	toBound?: "city";
}

export function useAddressSuggestions({
	query,
	enabled = true,
	toBound,
}: Options): UseAddressSuggestionsResult {
	const trimmed = query.trim();
	return useSuggestions<AddressSuggestion>({
		endpoint: "/api/address/suggest",
		query: trimmed,
		searchable: trimmed.length >= MIN_QUERY_LENGTH,
		enabled,
		debounceMs: DEBOUNCE_MS,
		params: { toBound },
	});
}
