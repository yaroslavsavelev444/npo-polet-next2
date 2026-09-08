"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "@/utils/cn";
import { submitContactRequestAction } from "../actions/submit-contact-request";
import { form as copy } from "../content/contacts-content";
import {
	CONTACT_REQUEST_LIMITS,
	type ContactRequestFormData,
	contactRequestSchema,
	PERSONAL_DATA_CONSENT_HREF,
} from "../schemas/contact-request.schema";

/**
 * Форма обратной связи.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СОСТОЯНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  — пустая: поля-строки без рамок, кнопка приглушена (согласия ещё нет);
 *  — заполнение: ошибки не показываются, пока поле не покинули (mode
 *    "onTouched") — подсказывать про «минимум 10 символов» на втором нажатии
 *    клавиши значит ругаться на человека за то, что он ещё печатает;
 *  — ошибка поля: линия под строкой краснеет и текст под ней объясняет, что
 *    не так;
 *  — отправка: кнопка показывает вращение, форма помечена aria-busy, повторная
 *    отправка невозможна;
 *  — успех: форма заменяется подтверждением на своём же месте;
 *  — сбой отправки: сообщение над кнопкой, введённое НЕ теряется.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЩИТА ОТ ДВОЙНОЙ ОТПРАВКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Два рубежа. react-hook-form не запускает второй handleSubmit, пока не
 * завершился первый (isSubmitting), а кнопка на это время получает настоящий
 * disabled. Одного `disabled` было бы мало: между нажатием и первым рендером
 * с новым состоянием помещается ещё одно нажатие на быстром двойном клике.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ КНОПКА НЕ disabled, ПОКА НЕТ СОГЛАСИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Настоящий disabled прячет причину: посетитель видит серую кнопку и не
 * понимает, чего ей не хватает, а клавиатурой до неё вообще не добраться.
 * Здесь кнопка выглядит недоступной (aria-disabled + приглушённый вид), но
 * остаётся фокусируемой: нажатие запускает валидацию, показывает ошибку у
 * чекбокса и уводит на него фокус. Отправить без согласия при этом всё равно
 * нельзя — схема требует literal(true), и та же схема повторно проверяется на
 * сервере.
 */
export function ContactForm() {
	const [serverError, setServerError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);
	const consentRef = useRef<HTMLInputElement | null>(null);
	/**
	 * Синхронный замок отправки.
	 *
	 * `isSubmitting` из react-hook-form и `disabled` на кнопке — это состояние
	 * React: между двумя нажатиями в одном тике ре-рендера ещё не было, ни
	 * флаг, ни атрибут не успевают обновиться, и быстрый двойной клик уходит
	 * на сервер дважды. Проверено — в базе появлялись две одинаковые записи.
	 *
	 * Ref меняется синхронно, поэтому второй вызов видит замок закрытым и
	 * выходит, не дойдя ни до одного await.
	 */
	const inFlightRef = useRef(false);

	const nameId = useId();
	const emailId = useId();
	const messageId = useId();
	const consentId = useId();

	const {
		register,
		handleSubmit,
		reset,
		watch,
		trigger,
		setFocus,
		formState: { errors, isSubmitting },
	} = useForm<ContactRequestFormData>({
		resolver: zodResolver(contactRequestSchema),
		mode: "onTouched",
		defaultValues: {
			name: "",
			email: "",
			message: "",
			// false, а не undefined: неотмеченный чекбокс должен быть валидным
			// значением, которое схема отвергнет, а не «поля нет».
			consent: false as unknown as true,
		},
	});

	// register() вызывается один раз и спредится: второй вызов ради ref внутри
	// разметки заново регистрировал бы поле на каждом рендере.
	const consentField = register("consent");

	const consentGiven = watch("consent") === true;
	const messageValue = watch("message") ?? "";
	const messageLeft = CONTACT_REQUEST_LIMITS.message.max - messageValue.length;

	const onSubmit = async (data: ContactRequestFormData) => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		setServerError(null);

		try {
			const result = await submitContactRequestAction(data);

			if (result.success) {
				reset();
				setSent(true);
				return;
			}

			setServerError(result.error);
		} catch {
			// Сеть отвалилась или server action не доехал. Сообщение общее:
			// технические подробности здесь ничем не помогут, а действие
			// одно — попробовать снова.
			setServerError(copy.errorFallback);
		} finally {
			// Замок снимается и после успеха: форма не размонтируется, а
			// подменяется подтверждением, и по кнопке «Написать ещё» тот же
			// экземпляр должен уметь отправить снова.
			inFlightRef.current = false;
		}
	};

	if (sent) {
		return (
			<SuccessPanel
				onRestart={() => {
					setSent(false);
					// Возврат к форме — это продолжение того же разговора,
					// поэтому фокус сразу в первое поле, а не в начало страницы.
					setTimeout(() => setFocus("name"), 0);
				}}
			/>
		);
	}

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			noValidate
			aria-busy={isSubmitting}
			className="flex flex-col gap-[clamp(1.75rem,3vw,2.5rem)]"
		>
			<Field
				id={nameId}
				label={copy.fields.name.label}
				error={errors.name?.message}
			>
				<input
					id={nameId}
					type="text"
					autoComplete={copy.fields.name.autoComplete}
					placeholder={copy.fields.name.placeholder}
					maxLength={CONTACT_REQUEST_LIMITS.name.max}
					className="contact-field__control text-[1.0625rem]"
					{...register("name")}
				/>
			</Field>

			<Field
				id={emailId}
				label={copy.fields.email.label}
				error={errors.email?.message}
			>
				<input
					id={emailId}
					type="email"
					inputMode="email"
					autoComplete={copy.fields.email.autoComplete}
					placeholder={copy.fields.email.placeholder}
					className="contact-field__control text-[1.0625rem]"
					{...register("email")}
				/>
			</Field>

			<Field
				id={messageId}
				label={copy.fields.message.label}
				error={errors.message?.message}
				// Счётчик появляется только на подходе к границе: постоянный
				// «12/4000» под каждым полем — это цифра, которую никто не
				// просил и которая мешает читать подсказку об ошибке.
				hint={
					messageLeft <= 300
						? `Осталось символов: ${Math.max(messageLeft, 0)}`
						: undefined
				}
			>
				<textarea
					id={messageId}
					rows={5}
					placeholder={copy.fields.message.placeholder}
					maxLength={CONTACT_REQUEST_LIMITS.message.max}
					className="contact-field__control contact-field__control--area text-[1.0625rem]"
					{...register("message")}
				/>
			</Field>

			{/* ── Согласие ───────────────────────────────────────────────── */}
			<div className="flex flex-col gap-2">
				<label
					htmlFor={consentId}
					data-invalid={errors.consent ? "true" : undefined}
					className="consent-label group flex cursor-pointer items-start gap-3"
				>
					<input
						{...consentField}
						id={consentId}
						type="checkbox"
						className="consent-input sr-only"
						aria-invalid={errors.consent ? "true" : undefined}
						aria-describedby={errors.consent ? `${consentId}-error` : undefined}
						ref={(node) => {
							// Своя ссылка нужна, чтобы увести сюда фокус при
							// попытке отправить форму без согласия. Ref от
							// register при этом обязан продолжать работать,
							// поэтому вызываются оба.
							consentField.ref(node);
							consentRef.current = node;
						}}
					/>
					<span className="consent-box mt-0.5" aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							className="size-3.5"
							fill="none"
							stroke="#fff"
							strokeWidth="3"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path className="consent-check" d="M4 12.5 9.5 18 20 6.5" />
						</svg>
					</span>
					<span className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
						{copy.consent.before}
						<Link
							href={PERSONAL_DATA_CONSENT_HREF}
							target="_blank"
							rel="noopener noreferrer"
							// Клик по ссылке не должен переключать чекбокс —
							// метка обёрнута вокруг обоих.
							onClick={(event) => event.stopPropagation()}
							className="text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:decoration-current"
						>
							{copy.consent.linkLabel}
						</Link>
						{copy.consent.after}
					</span>
				</label>

				{errors.consent ? (
					<p
						id={`${consentId}-error`}
						className="pl-8 text-[0.8125rem] text-[var(--error)]"
					>
						{errors.consent.message}
					</p>
				) : null}
			</div>

			{/* ── Ошибка отправки ────────────────────────────────────────── */}
			{serverError ? (
				<div
					role="alert"
					className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_9%,transparent)] px-4 py-3"
				>
					<AlertCircle
						className="mt-0.5 size-4 shrink-0 text-[var(--error)]"
						aria-hidden="true"
					/>
					<p className="text-[0.875rem] leading-relaxed text-[var(--text-primary)]">
						{serverError}
					</p>
				</div>
			) : null}

			{/* ── Отправка ───────────────────────────────────────────────── */}
			<div className="flex flex-col gap-3">
				<button
					type="submit"
					disabled={isSubmitting}
					aria-disabled={!consentGiven || isSubmitting}
					onClick={
						consentGiven
							? undefined
							: (event) => {
									// Согласия нет: не даём форме уйти, показываем
									// ошибку и ведём к тому, что мешает.
									event.preventDefault();
									void trigger("consent").then(() => {
										consentRef.current?.focus();
									});
								}
					}
					className={cn(
						"contact-submit group inline-flex w-full items-center justify-center gap-2.5 rounded-[var(--radius-sm)] px-7 py-4",
						"text-[1rem] font-semibold text-white",
						consentGiven &&
							!isSubmitting &&
							"bg-[var(--primary)] hover:bg-[var(--primary-600)]",
						isSubmitting && "bg-[var(--primary-600)] cursor-progress",
					)}
				>
					{isSubmitting ? (
						<>
							<Loader2
								className="contact-submit__spinner size-4"
								aria-hidden="true"
							/>
							{copy.submit.pending}
						</>
					) : (
						<>
							{copy.submit.idle}
							<ArrowRight
								className="size-4 transition-transform duration-200 group-hover:translate-x-1"
								aria-hidden="true"
							/>
						</>
					)}
				</button>

				<p className="text-[0.75rem] leading-relaxed text-[var(--text-muted)]">
					{copy.note}
				</p>
			</div>
		</form>
	);
}

/**
 * Строка ввода: подпись, контрол и место под ошибку.
 *
 * Место под сообщение зарезервировано (min-height), а не появляется вместе с
 * текстом: иначе форма подпрыгивает под курсором в момент, когда пользователь
 * уже целится в следующее поле.
 */
function Field({
	id,
	label,
	error,
	hint,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="contact-field" data-invalid={error ? "true" : undefined}>
				<label
					htmlFor={id}
					className="contact-field__label u-mono block text-[0.6875rem] leading-none text-[var(--text-muted)]"
				>
					{label}
				</label>
				{children}
			</div>

			<p
				className={cn(
					"min-h-[1.125rem] text-[0.8125rem] leading-tight",
					error ? "text-[var(--error)]" : "text-[var(--text-muted)]",
				)}
				role={error ? "alert" : undefined}
			>
				{error ?? hint ?? ""}
			</p>
		</div>
	);
}

/**
 * Подтверждение отправки на месте формы.
 *
 * Не тост: тост исчезает через несколько секунд, а вопрос «отправилось или
 * нет» возникает позже. Ответ должен оставаться на экране — вместе с
 * обещанием срока и возможностью написать ещё.
 */
function SuccessPanel({ onRestart }: { onRestart: () => void }) {
	return (
		<div
			className="contact-success flex flex-col items-start gap-5"
			// Замена формы подтверждением — событие, о котором обязан узнать
			// тот, кто не видит экрана.
			role="status"
			aria-live="polite"
		>
			<span className="flex size-12 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[color-mix(in_srgb,var(--success)_12%,transparent)]">
				<svg
					viewBox="0 0 24 24"
					className="size-6"
					fill="none"
					stroke="var(--success)"
					strokeWidth="2.25"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path className="contact-success__check" d="M4 12.5 9.5 18 20 6.5" />
				</svg>
			</span>

			<div className="flex flex-col gap-3">
				<p className="text-[clamp(1.25rem,1.05rem+0.8vw,1.75rem)] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
					{copy.success.title}
				</p>
				<p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
					{copy.success.body}
				</p>
			</div>

			<button
				type="button"
				onClick={onRestart}
				className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-5 py-3 text-[0.9375rem] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]"
			>
				{copy.success.again}
				<ArrowRight
					className="size-4 transition-transform duration-200 group-hover:translate-x-1"
					aria-hidden="true"
				/>
			</button>
		</div>
	);
}
