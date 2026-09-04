"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	AddressSuggestDegradeReason,
	AddressSuggestion,
	AddressSuggestResponse,
} from "../types";

/**
 * Загрузка подсказок адреса с защитой от лишних запросов и race conditions.
 *
 * Правила подобраны под реальный ввод адреса, а не под абстрактный автокомплит:
 *
 *  • debounce 250 мс — короче средней паузы между словами, но длиннее паузы
 *    между символами: при обычном темпе набора «москва ленина 10» уходит 3–4
 *    запроса вместо 17;
 *  • минимум 3 символа — по одной-двум буквам DaData возвращает шум, а квота
 *    расходуется;
 *  • каждый новый запрос отменяет предыдущий (AbortController) И проверяется
 *    по номеру: ответ на устаревший запрос не может перезаписать актуальный,
 *    даже если пришёл позже;
 *  • результаты кэшируются на время жизни компонента — возврат к уже
 *    набранному префиксу (backspace) отвечает мгновенно и без запроса.
 */

const DEBOUNCE_MS = 250;
export const MIN_QUERY_LENGTH = 3;

export type SuggestionsStatus = "idle" | "loading" | "ready" | "degraded";

export interface UseAddressSuggestionsResult {
	suggestions: AddressSuggestion[];
	status: SuggestionsStatus;
	/** Подсказки недоступны: причина для подсказки пользователю. */
	degradedReason: AddressSuggestDegradeReason | null;
	/** Запрос выполнен, подсказок нет — повод предложить ручной ввод. */
	isEmpty: boolean;
	/** Повторить последний запрос (кнопка «Попробовать снова»). */
	retry: () => void;
}

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
	const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
	const [status, setStatus] = useState<SuggestionsStatus>("idle");
	const [degradedReason, setDegradedReason] =
		useState<AddressSuggestDegradeReason | null>(null);
	const [retryToken, setRetryToken] = useState(0);

	const cacheRef = useRef(new Map<string, AddressSuggestion[]>());
	const abortRef = useRef<AbortController | null>(null);
	// Монотонный номер запроса: сравнение с ним — вторая линия защиты от
	// гонок. abort() не гарантирует, что уже запланированный setState не
	// выполнится, а несовпадение номера гарантирует.
	const requestIdRef = useRef(0);

	const trimmed = query.trim();
	const isQueryLongEnough = trimmed.length >= MIN_QUERY_LENGTH;

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryToken — команда «повторить», а не читаемое значение
	useEffect(() => {
		if (!enabled || !isQueryLongEnough) {
			abortRef.current?.abort();
			abortRef.current = null;
			requestIdRef.current += 1;
			setSuggestions([]);
			setStatus("idle");
			setDegradedReason(null);
			return;
		}

		const cacheKey = `${toBound ?? "full"}:${trimmed.toLowerCase()}`;
		const cached = cacheRef.current.get(cacheKey);
		if (cached) {
			setSuggestions(cached);
			setStatus("ready");
			setDegradedReason(null);
			return;
		}

		setStatus("loading");

		const timer = setTimeout(() => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			requestIdRef.current += 1;
			const requestId = requestIdRef.current;

			void (async () => {
				try {
					const response = await fetch("/api/address/suggest", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ query: trimmed, toBound }),
						signal: controller.signal,
					});

					if (requestId !== requestIdRef.current) return;

					if (!response.ok) {
						setSuggestions([]);
						setStatus("degraded");
						setDegradedReason("unavailable");
						return;
					}

					const data = (await response.json()) as AddressSuggestResponse;
					if (requestId !== requestIdRef.current) return;

					if (data.degraded && data.degraded !== "too_short") {
						setSuggestions([]);
						setStatus("degraded");
						setDegradedReason(data.degraded);
						return;
					}

					const list = data.suggestions ?? [];
					cacheRef.current.set(cacheKey, list);
					setSuggestions(list);
					setStatus("ready");
					setDegradedReason(null);
				} catch (error) {
					// Отмена — штатное завершение, а не ошибка: состояние менять
					// нельзя, иначе актуальный запрос будет сброшен предыдущим.
					if (error instanceof DOMException && error.name === "AbortError") {
						return;
					}
					if (requestId !== requestIdRef.current) return;
					setSuggestions([]);
					setStatus("degraded");
					setDegradedReason("unavailable");
				}
			})();
		}, DEBOUNCE_MS);

		return () => clearTimeout(timer);
		// retryToken в теле эффекта не используется, но обязан оставаться в
		// зависимостях: смена его значения — это и есть команда «повторить
		// запрос» от кнопки «Попробовать снова». Без него повтор при том же
		// тексте запроса не сработал бы вовсе.
	}, [trimmed, enabled, isQueryLongEnough, toBound, retryToken]);

	// Отменяем висящий запрос при размонтировании: без этого переход со
	// страницы во время загрузки оставляет setState на размонтированном
	// компоненте.
	useEffect(() => () => abortRef.current?.abort(), []);

	const retry = useCallback(() => {
		const cacheKey = `${toBound ?? "full"}:${trimmed.toLowerCase()}`;
		cacheRef.current.delete(cacheKey);
		setRetryToken((token) => token + 1);
	}, [trimmed, toBound]);

	return {
		suggestions,
		status,
		degradedReason,
		isEmpty: status === "ready" && suggestions.length === 0,
		retry,
	};
}
