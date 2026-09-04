"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
	type CheckoutFieldErrors,
	validateCheckout,
} from "../lib/checkout-schema";
import { filterStaleServerErrors } from "../lib/server-errors";
import type { CheckoutSubmitInput } from "../types";

/**
 * Состояние валидации формы оформления заказа.
 *
 * Три требования, из которых выросла эта модель:
 *
 *  1. Ошибка не должна появляться раньше, чем пользователь дошёл до поля.
 *     Поэтому ошибка показывается, только если поле «тронуто» (blur/изменение
 *     после первого касания) ИЛИ форму уже пытались отправить.
 *  2. Ошибка должна исчезать сразу после исправления. Поэтому клиентские
 *     ошибки не хранятся в состоянии вообще — они ВЫЧИСЛЯЮТСЯ из текущих
 *     значений на каждый рендер. Хранимая копия неизбежно устаревает: именно
 *     так появляются «я всё исправил, а ошибка висит».
 *  3. Серверные ошибки (например, «Организация не найдена») клиент повторить
 *     не может, поэтому они хранятся — но помечаются снимком значений на
 *     момент отправки и автоматически гаснут, как только соответствующее
 *     значение изменилось. Это снимает вторую половину проблемы устаревших
 *     ошибок и не требует ручного сброса в каждом обработчике.
 */

export interface CheckoutValidationState {
	/** Все ошибки формы независимо от того, показываем мы их сейчас или нет. */
	allErrors: CheckoutFieldErrors;
	/** Ошибки, которые пользователь должен видеть прямо сейчас. */
	visibleErrors: CheckoutFieldErrors;
	isValid: boolean;
	submitAttempted: boolean;
	markTouched: (path: string) => void;
	/** Вызывается при попытке отправки: показывает все ошибки сразу. */
	revealAll: () => void;
	setServerErrors: (
		errors: CheckoutFieldErrors,
		submittedValue: CheckoutSubmitInput,
	) => void;
	clearServerErrors: () => void;
	/** Сброс после успешной отправки/смены способа доставки. */
	reset: () => void;
}

export function useCheckoutValidation(
	value: CheckoutSubmitInput,
): CheckoutValidationState {
	const [touched, setTouched] = useState<ReadonlySet<string>>(
		() => new Set<string>(),
	);
	const [submitAttempted, setSubmitAttempted] = useState(false);
	const [serverErrors, setServerErrorsState] = useState<CheckoutFieldErrors>(
		{},
	);
	// Снимок значений на момент отправки — по нему определяется, устарела ли
	// серверная ошибка. Хранится в ref: он не влияет на рендер сам по себе,
	// меняется строго вместе с serverErrors.
	const serverSnapshotRef = useRef<CheckoutSubmitInput | null>(null);

	const allErrors = useMemo(() => validateCheckout(value), [value]);

	// Ошибка, чьё поле пользователь уже изменил, гаснет сама — см.
	// filterStaleServerErrors.
	const liveServerErrors = useMemo(
		() =>
			filterStaleServerErrors(serverErrors, serverSnapshotRef.current, value),
		[serverErrors, value],
	);

	const visibleErrors = useMemo(() => {
		const visible: CheckoutFieldErrors = {};
		for (const [path, message] of Object.entries(allErrors)) {
			if (submitAttempted || touched.has(path)) visible[path] = message;
		}
		// Серверные ошибки видны всегда: их источник — уже совершённая попытка
		// отправки, значит скрывать их не от чего.
		return { ...visible, ...liveServerErrors };
	}, [allErrors, liveServerErrors, submitAttempted, touched]);

	const markTouched = useCallback((path: string) => {
		setTouched((previous) => {
			if (previous.has(path)) return previous;
			const next = new Set(previous);
			next.add(path);
			return next;
		});
	}, []);

	const revealAll = useCallback(() => setSubmitAttempted(true), []);

	const setServerErrors = useCallback(
		(errors: CheckoutFieldErrors, submittedValue: CheckoutSubmitInput) => {
			serverSnapshotRef.current = submittedValue;
			setServerErrorsState(errors);
		},
		[],
	);

	const clearServerErrors = useCallback(() => {
		serverSnapshotRef.current = null;
		setServerErrorsState({});
	}, []);

	const reset = useCallback(() => {
		setTouched(new Set<string>());
		setSubmitAttempted(false);
		serverSnapshotRef.current = null;
		setServerErrorsState({});
	}, []);

	return {
		allErrors,
		visibleErrors,
		isValid: Object.keys(allErrors).length === 0,
		submitAttempted,
		markTouched,
		revealAll,
		setServerErrors,
		clearServerErrors,
		reset,
	};
}
