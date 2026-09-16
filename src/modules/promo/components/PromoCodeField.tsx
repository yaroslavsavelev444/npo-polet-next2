"use client";

import { AlertCircle, Check, Info, Loader2, Tag, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { formatPrice } from "@/modules/productCard";
import { applyPromoCodeAction } from "../actions/promo.actions";
import {
	normalizePromoCode,
	PROMO_CODE_INPUT_ID,
	PROMO_CODE_MAX_LENGTH,
} from "../lib/promo-code";
import type { PromoApplyPreview } from "../types";
import styles from "./Promo.module.css";

interface Props {
	/** Применённый код. Владелец состояния — форма оформления заказа. */
	applied: PromoApplyPreview | null;
	onAppliedChange: (preview: PromoApplyPreview | null) => void;
	/** Корзина пуста или невалидна — применять нечего. */
	disabled?: boolean;
	/**
	 * Отпечаток корзины. Меняется вместе с составом и суммой заказа — по нему
	 * применённый код перепроверяется заново.
	 */
	cartKey?: string;
	/** Идёт перепроверка — колонка денег помечает суммы как пересчитываемые. */
	onRevalidatingChange?: (busy: boolean) => void;
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
 * ── Перепроверка при изменении корзины ────────────────────────────────────
 * Скидка по коду считается ОТ КОРЗИНЫ: процент от суммы, порог минимального
 * заказа, список товаров, на которые код распространяется. Стоит покупателю
 * изменить количество прямо на оформлении — и показанная скидка относится к
 * корзине, которой больше нет. Поэтому при смене `cartKey` код
 * перепроверяется тем же действием, что и при нажатии «Применить»: другого
 * источника правды о скидке в интерфейсе нет и быть не должно.
 *
 * Отказ при перепроверке снимает код и объясняет причину словами сервера —
 * кроме одного случая. Упёршись в лимит попыток, мы НЕ снимаем код: он
 * по-прежнему верен, проверить его прямо сейчас просто нельзя, а снятие
 * лишило бы покупателя скидки, на которую он имеет право. Вместо этого
 * блок честно предупреждает, что итог уточнится при оформлении, — где
 * сервер пересчитает всё заново (см. checkout.actions.ts).
 *
 * ── Ошибка ────────────────────────────────────────────────────────────────
 * Ошибка живёт под полем, а не в тосте: она относится к конкретному вводу,
 * и её нужно перечитывать, исправляя код. Сообщение приходит с сервера
 * готовым (см. modules/promo/lib/promo-rules.ts) — здесь оно не
 * переписывается, чтобы формулировка была одна на всё приложение.
 * Единственное исключение — `min_order_amount`: причина исправимая
 * добавлением товаров, поэтому она оформлена подсказкой, а не отказом.
 */
export function PromoCodeField({
	applied,
	onAppliedChange,
	disabled,
	cartKey,
	onRevalidatingChange,
}: Props) {
	// Постоянный id, а не useId: на него ссылается общий список ошибок формы
	// оформления заказа (CHECKOUT_FIELD_IDS.promoCode), а сгенерированный id
	// снаружи знать невозможно.
	const inputId = PROMO_CODE_INPUT_ID;
	const [code, setCode] = useState("");
	const [message, setMessage] = useState<{
		tone: "error" | "hint";
		text: string;
	} | null>(null);
	const [isPending, startTransition] = useTransition();
	const [isRevalidating, setIsRevalidating] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// ── Перепроверка при изменении корзины ──────────────────────────────────
	//
	// Отпечаток корзины на момент последней успешной проверки. Первый эффект
	// после применения кода не должен идти на сервер второй раз подряд:
	// проверка только что была, и её результат уже показан.
	const checkedKeyRef = useRef<string | undefined>(cartKey);
	const appliedCode = applied?.code ?? null;

	useEffect(() => {
		onRevalidatingChange?.(isRevalidating);
	}, [isRevalidating, onRevalidatingChange]);

	useEffect(() => {
		if (!appliedCode) {
			checkedKeyRef.current = cartKey;
			return;
		}
		if (cartKey === undefined || cartKey === checkedKeyRef.current) return;

		// Пауза перед запросом: количество меняют нажатиями подряд, и проверять
		// каждое промежуточное состояние значило бы и тратить попытки лимита, и
		// показывать результаты проверок, которые пользователь уже отменил
		// следующим нажатием.
		let cancelled = false;
		setIsRevalidating(true);

		const timer = setTimeout(async () => {
			const result = await applyPromoCodeAction(appliedCode);
			if (cancelled) return;

			checkedKeyRef.current = cartKey;
			setIsRevalidating(false);

			if (result.success) {
				onAppliedChange(result.data);
				setMessage(null);
				return;
			}

			if (result.reason === "rate_limited") {
				// Код не отменён — его просто не удалось перепроверить сейчас.
				// Снять его значило бы отобрать законную скидку.
				setMessage({
					tone: "hint",
					text: "Не удалось перепроверить промокод — итоговую сумму уточним при оформлении заказа",
				});
				return;
			}

			onAppliedChange(null);
			setMessage({
				tone: "error",
				text: `Промокод ${appliedCode} больше не применим: ${lowerFirst(result.message)}`,
			});
		}, 600);

		return () => {
			cancelled = true;
			clearTimeout(timer);
			setIsRevalidating(false);
		};
	}, [appliedCode, cartKey, onAppliedChange]);

	function submit(event: React.FormEvent) {
		event.preventDefault();
		const value = normalizePromoCode(code);
		if (value === "" || isPending || disabled) return;

		setMessage(null);
		startTransition(async () => {
			const result = await applyPromoCodeAction(value);

			if (result.success) {
				checkedKeyRef.current = cartKey;
				onAppliedChange(result.data);
				setCode("");
				return;
			}

			setMessage({
				tone: result.reason === "min_order_amount" ? "hint" : "error",
				text: result.message,
			});
			// Фокус возвращается в поле: следующее действие покупателя —
			// исправить код, и искать поле заново он не должен.
			inputRef.current?.focus();
		});
	}

	function remove() {
		onAppliedChange(null);
		setMessage(null);
	}

	if (applied) {
		return (
			<section className={styles.root} aria-label="Промокод">
				<div className={styles.applied}>
					<span className={styles.appliedMark} aria-hidden>
						{isRevalidating ? (
							<Loader2 size={12} className={styles.spin} />
						) : (
							<Check size={12} strokeWidth={3} />
						)}
					</span>

					<div className={styles.appliedBody}>
						<p className={styles.appliedHead}>
							<span className={styles.appliedCode}>{applied.code}</span>
							<span className={styles.appliedAmount}>
								−{formatPrice(applied.discountAmount)}
							</span>
						</p>
						{/* Роль status, а не alert: применённый код — это подтверждение
						    успеха, и перебивать им то, что читает пользователь, не нужно. */}
						<p role="status" className={styles.appliedText}>
							{isRevalidating ? "Пересчитываем скидку…" : applied.message}
						</p>
						{applied.centralDiscountSuppressed && (
							// Молча заменить действующую скидку нельзя: покупатель видел
							// её в корзине и обязан понимать, почему её больше нет в итоге.
							<p className={styles.appliedText}>
								Промокод выгоднее действующей скидки и заменил её
							</p>
						)}
					</div>

					<button
						type="button"
						onClick={remove}
						disabled={isRevalidating}
						aria-label={`Убрать промокод ${applied.code}`}
						className={styles.remove}
					>
						<X size={15} aria-hidden />
					</button>
				</div>

				{message && <Message tone={message.tone} text={message.text} />}
			</section>
		);
	}

	const isHint = message?.tone === "hint";

	return (
		<section className={styles.root}>
			<form onSubmit={submit} noValidate>
				<label htmlFor={inputId} className={styles.label}>
					<Tag size={13} aria-hidden />
					Промокод
				</label>

				<div className={styles.row} style={{ marginTop: "0.6rem" }}>
					<input
						id={inputId}
						ref={inputRef}
						value={code}
						// Значение приводится к каноническому виду прямо при вводе:
						// покупатель видит ровно то, что уйдёт на сервер, и «summer24»
						// не выглядит другим кодом, чем «SUMMER24».
						onChange={(e) => {
							setCode(normalizePromoCode(e.target.value));
							if (message) setMessage(null);
						}}
						maxLength={PROMO_CODE_MAX_LENGTH}
						disabled={disabled || isPending}
						autoComplete="off"
						autoCapitalize="characters"
						spellCheck={false}
						enterKeyHint="done"
						placeholder="Введите код"
						aria-invalid={message !== null && !isHint}
						aria-describedby={message ? `${inputId}-message` : undefined}
						className={`${styles.input} ${
							message && !isHint ? styles.inputInvalid : ""
						}`}
					/>

					<button
						type="submit"
						disabled={disabled || isPending || normalizePromoCode(code) === ""}
						className={styles.apply}
					>
						{isPending ? "Проверяем…" : "Применить"}
					</button>
				</div>

				{message && (
					<Message
						id={`${inputId}-message`}
						tone={message.tone}
						text={message.text}
					/>
				)}
			</form>
		</section>
	);
}

function Message({
	id,
	tone,
	text,
}: {
	id?: string;
	tone: "error" | "hint";
	text: string;
}) {
	const isHint = tone === "hint";
	return (
		<p
			id={id}
			// Отказ читается вслух сразу (alert), подсказка — в порядке очереди
			// (status): она не мешает вводу и не требует немедленной реакции.
			role={isHint ? "status" : "alert"}
			className={`${styles.message} ${
				isHint ? styles.messageHint : styles.messageError
			}`}
			style={{ marginTop: "0.5rem" }}
		>
			{isHint ? (
				<Info size={13} aria-hidden className={styles.messageIcon} />
			) : (
				<AlertCircle size={13} aria-hidden className={styles.messageIcon} />
			)}
			{text}
		</p>
	);
}

/** «Промокод истёк» → «промокод истёк»: сообщение встраивается в фразу. */
function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}
