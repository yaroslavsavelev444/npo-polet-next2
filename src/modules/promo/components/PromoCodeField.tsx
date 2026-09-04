"use client";

import { AlertCircle, Check, Tag, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { formatPrice } from "@/modules/productCard";
import { cn } from "@/utils/cn";
import { applyPromoCodeAction } from "../actions/promo.actions";
import {
	normalizePromoCode,
	PROMO_CODE_INPUT_ID,
	PROMO_CODE_MAX_LENGTH,
} from "../lib/promo-code";
import type { PromoApplyPreview, PromoRejectionReason } from "../types";

interface Props {
	/** Применённый код. Владелец состояния — форма оформления заказа. */
	applied: PromoApplyPreview | null;
	onAppliedChange: (preview: PromoApplyPreview | null) => void;
	/** Корзина пуста или невалидна — применять нечего. */
	disabled?: boolean;
}

/**
 * Поле промокода на странице оформления заказа.
 *
 * Блок существует в двух взаимоисключающих состояниях — «ввод» и
 * «применён», — и никогда в обоих сразу. Это главное решение здесь:
 * поле ввода, оставленное рядом с применённым кодом, каждый раз ставит
 * вопрос «а этот код в поле — он уже действует или ещё нет?». Применённый
 * код показывается тем, чем он стал: строкой заказа с суммой скидки и
 * кнопкой снять.
 *
 * ── Обратная связь ────────────────────────────────────────────────────────
 * Ответ приходит не мгновенно (запрос к базе), поэтому состояние проверки
 * видно сразу по нажатию, а не по получении ответа: кнопка получает
 * визуальный отклик на pointer-down, а на время запроса поле блокируется —
 * иначе покупатель успевает изменить код и увидеть результат проверки
 * ПРЕДЫДУЩЕГО.
 *
 * ── Ошибка ────────────────────────────────────────────────────────────────
 * Ошибка живёт под полем, а не в тосте: она относится к конкретному вводу,
 * и её нужно перечитывать, исправляя код. Сообщение приходит с сервера
 * готовым (см. modules/promo/lib/promo-rules.ts) — здесь оно не
 * переписывается, чтобы формулировка была одна на всё приложение.
 * Единственное исключение — `min_order_amount`: причина исправимая
 * добавлением товаров, поэтому она оформлена подсказкой, а не отказом.
 */
export function PromoCodeField({ applied, onAppliedChange, disabled }: Props) {
	// Постоянный id, а не useId: на него ссылается общий список ошибок формы
	// оформления заказа (CHECKOUT_FIELD_IDS.promoCode), а сгенерированный id
	// снаружи знать невозможно.
	const inputId = PROMO_CODE_INPUT_ID;
	const [code, setCode] = useState("");
	const [error, setError] = useState<{
		reason: PromoRejectionReason | "auth_required" | "rate_limited" | "unknown";
		message: string;
	} | null>(null);
	const [isPending, startTransition] = useTransition();
	const inputRef = useRef<HTMLInputElement>(null);

	function submit(event: React.FormEvent) {
		event.preventDefault();
		const value = normalizePromoCode(code);
		if (value === "" || isPending || disabled) return;

		setError(null);
		startTransition(async () => {
			const result = await applyPromoCodeAction(value);

			if (result.success) {
				onAppliedChange(result.data);
				setCode("");
				return;
			}

			setError({ reason: result.reason, message: result.message });
			// Фокус возвращается в поле: следующее действие покупателя —
			// исправить код, и искать поле заново он не должен.
			inputRef.current?.focus();
		});
	}

	function remove() {
		onAppliedChange(null);
		setError(null);
	}

	if (applied) {
		return (
			<section className="rounded-[var(--radius-lg)] border border-(--success)/40 bg-(--success)/8 p-4 motion-safe:animate-[fade-in-up_320ms_cubic-bezier(0.16,1,0.3,1)]">
				<div className="flex items-start gap-3">
					<span
						className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--success) text-white"
						aria-hidden
					>
						<Check className="h-4 w-4" strokeWidth={3} />
					</span>

					<div className="min-w-0 flex-1">
						<p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-(--text-primary)">
							<span className="font-mono tracking-wide">{applied.code}</span>
							<span className="font-normal text-(--success)">
								−{formatPrice(applied.discountAmount)}
							</span>
						</p>
						{/* Роль status, а не alert: применённый код — это подтверждение
						    успеха, и перебивать им то, что читает пользователь, не нужно. */}
						<p role="status" className="mt-0.5 text-sm text-(--text-secondary)">
							{applied.message}
						</p>
						{applied.centralDiscountSuppressed && (
							// Молча заменить действующую скидку нельзя: покупатель видел
							// её в корзине и обязан понимать, почему её больше нет в итоге.
							<p className="mt-1 text-xs text-(--text-secondary)">
								Промокод выгоднее действующей скидки и заменил её
							</p>
						)}
					</div>

					<button
						type="button"
						onClick={remove}
						aria-label={`Убрать промокод ${applied.code}`}
						className="-m-1.5 shrink-0 rounded-full p-1.5 text-(--text-secondary) transition-[color,background-color,transform] duration-150 ease-out hover:bg-(--surface) hover:text-(--text-primary) active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary)"
					>
						<X className="h-4 w-4" aria-hidden />
					</button>
				</div>
			</section>
		);
	}

	const isHint = error?.reason === "min_order_amount";

	return (
		<section className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-4">
			<form onSubmit={submit} noValidate>
				<label
					htmlFor={inputId}
					className="mb-2 flex items-center gap-2 text-sm font-medium text-(--text-primary)"
				>
					<Tag className="h-4 w-4 text-(--text-secondary)" aria-hidden />
					Промокод
				</label>

				<div className="flex gap-2">
					<input
						id={inputId}
						ref={inputRef}
						value={code}
						// Значение приводится к каноническому виду прямо при вводе:
						// покупатель видит ровно то, что уйдёт на сервер, и «summer24»
						// не выглядит другим кодом, чем «SUMMER24».
						onChange={(e) => {
							setCode(normalizePromoCode(e.target.value));
							if (error) setError(null);
						}}
						maxLength={PROMO_CODE_MAX_LENGTH}
						disabled={disabled || isPending}
						autoComplete="off"
						autoCapitalize="characters"
						spellCheck={false}
						enterKeyHint="done"
						placeholder="Введите код"
						aria-invalid={error !== null && !isHint}
						aria-describedby={error ? `${inputId}-message` : undefined}
						className={cn(
							"min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-transparent px-3 py-2 font-mono text-sm uppercase tracking-wide outline-none",
							"transition-colors duration-150 ease-out placeholder:font-sans placeholder:normal-case placeholder:tracking-normal",
							"disabled:opacity-60",
							error && !isHint
								? "border-(--error) focus:border-(--error)"
								: "border-(--border) focus:border-(--primary)",
						)}
					/>

					{/* Кнопка отвечает на нажатие мгновенно (active:scale), не дожидаясь
					    ответа сервера: без этого промежуток до ответа читается как
					    «нажатие не сработало», и покупатель жмёт ещё раз. */}
					<button
						type="submit"
						disabled={disabled || isPending || normalizePromoCode(code) === ""}
						className={cn(
							"shrink-0 rounded-[var(--radius-sm)] border border-(--border) px-4 py-2 text-sm font-medium text-(--text-primary)",
							"transition-[transform,background-color,border-color,opacity] duration-150 ease-out",
							"hover:border-(--primary) hover:text-(--primary)",
							"active:scale-[0.97] motion-reduce:active:scale-100",
							"disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-(--border) disabled:hover:text-(--text-primary) disabled:active:scale-100",
							"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--primary)",
						)}
					>
						{isPending ? "Проверяем…" : "Применить"}
					</button>
				</div>

				{error && (
					<p
						id={`${inputId}-message`}
						// Отказ читается вслух сразу (alert), подсказка о недоборе суммы —
						// в порядке очереди (status): она не мешает вводу и не требует
						// немедленной реакции.
						role={isHint ? "status" : "alert"}
						className={cn(
							"mt-2 flex items-start gap-1.5 text-sm motion-safe:animate-[fade-in-up_240ms_cubic-bezier(0.16,1,0.3,1)]",
							isHint ? "text-(--text-secondary)" : "text-(--error)",
						)}
					>
						<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
						{error.message}
					</p>
				)}
			</form>
		</section>
	);
}
