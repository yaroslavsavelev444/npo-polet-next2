"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AddressSuggestDegradeReason } from "../types";

/**
 * Загрузка подсказок из наших роутов (/api/address/suggest,
 * /api/company/suggest) с защитой от лишних запросов и race conditions.
 *
 *  • debounce — запрос уходит после паузы в наборе, а не на каждый символ;
 *  • порог длины решает вызывающий (`searchable`): у адресов и организаций
 *    он разный, а ниже порога квота тратится на шум;
 *  • каждый новый запрос отменяет предыдущий (AbortController) И проверяется
 *    по номеру: ответ на устаревший запрос не может перезаписать актуальный,
 *    даже если пришёл позже;
 *  • результаты кэшируются на время жизни компонента — возврат к уже
 *    набранному запросу (backspace) отвечает мгновенно и без запроса.
 *
 * Оба роута отвечают одинаково: `{ suggestions, degraded? }`, где `degraded`
 * значит «подсказки недоступны — предложите ручной ввод».
 */

export type SuggestionsStatus = "idle" | "loading" | "ready" | "degraded";

export interface UseSuggestionsResult<T> {
	suggestions: T[];
	status: SuggestionsStatus;
	/** Подсказки недоступны: причина для подсказки пользователю. */
	degradedReason: AddressSuggestDegradeReason | null;
	/** Запрос выполнен, подсказок нет — повод предложить ручной ввод. */
	isEmpty: boolean;
	/** Повторить последний запрос (кнопка «Попробовать снова»). */
	retry: () => void;
}

interface Options {
	endpoint: string;
	/** Уже нормализованный запрос. */
	query: string;
	/** Запрос достаточно длинный, чтобы его отправлять. */
	searchable: boolean;
	/** Выключает загрузку (например, поле не в фокусе). */
	enabled: boolean;
	debounceMs: number;
	/** Дополнительные поля тела запроса. Участвуют в ключе кэша. */
	params?: Record<string, string | undefined>;
}

interface SuggestResponse<T> {
	suggestions?: T[];
	degraded?: AddressSuggestDegradeReason;
}

export function useSuggestions<T>({
	endpoint,
	query,
	searchable,
	enabled,
	debounceMs,
	params,
}: Options): UseSuggestionsResult<T> {
	const [suggestions, setSuggestions] = useState<T[]>([]);
	const [status, setStatus] = useState<SuggestionsStatus>("idle");
	const [degradedReason, setDegradedReason] =
		useState<AddressSuggestDegradeReason | null>(null);
	const [retryToken, setRetryToken] = useState(0);

	const cacheRef = useRef(new Map<string, T[]>());
	const abortRef = useRef<AbortController | null>(null);
	// Монотонный номер запроса: сравнение с ним — вторая линия защиты от
	// гонок. abort() не гарантирует, что уже запланированный setState не
	// выполнится, а несовпадение номера гарантирует.
	const requestIdRef = useRef(0);

	// Объект параметров пересоздаётся на каждом рендере — в зависимости
	// эффекта идёт его строковое представление.
	const paramsKey = JSON.stringify(params ?? {});
	const cacheKey = `${paramsKey}:${query.toLowerCase()}`;

	// biome-ignore lint/correctness/useExhaustiveDependencies: retryToken — команда «повторить», а не читаемое значение
	useEffect(() => {
		if (!enabled || !searchable) {
			abortRef.current?.abort();
			abortRef.current = null;
			requestIdRef.current += 1;
			setSuggestions([]);
			setStatus("idle");
			setDegradedReason(null);
			return;
		}

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
					const response = await fetch(endpoint, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ query, ...JSON.parse(paramsKey) }),
						signal: controller.signal,
					});

					if (requestId !== requestIdRef.current) return;

					if (!response.ok) {
						setSuggestions([]);
						setStatus("degraded");
						setDegradedReason("unavailable");
						return;
					}

					const data = (await response.json()) as SuggestResponse<T>;
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
		}, debounceMs);

		return () => clearTimeout(timer);
		// retryToken в теле эффекта не используется, но обязан оставаться в
		// зависимостях: смена его значения — это и есть команда «повторить
		// запрос» от кнопки «Попробовать снова». Без него повтор при том же
		// тексте запроса не сработал бы вовсе.
	}, [
		endpoint,
		query,
		cacheKey,
		paramsKey,
		enabled,
		searchable,
		debounceMs,
		retryToken,
	]);

	// Отменяем висящий запрос при размонтировании: без этого переход со
	// страницы во время загрузки оставляет setState на размонтированном
	// компоненте.
	useEffect(() => () => abortRef.current?.abort(), []);

	const retry = useCallback(() => {
		cacheRef.current.delete(cacheKey);
		setRetryToken((token) => token + 1);
	}, [cacheKey]);

	return {
		suggestions,
		status,
		degradedReason,
		isEmpty: status === "ready" && suggestions.length === 0,
		retry,
	};
}
