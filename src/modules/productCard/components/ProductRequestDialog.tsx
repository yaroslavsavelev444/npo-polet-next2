"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { formatRuPhoneInput } from "@/modules/checkout/lib/phone";
import { submitProductRequestAction } from "@/modules/contact/actions/submit-product-request";
import { PERSONAL_DATA_CONSENT_HREF } from "@/modules/contact/schemas/contact-request.schema";
import {
	PRODUCT_REQUEST_LIMITS,
	type ProductRequestFormData,
	type ProductRequestFormInput,
	productRequestSchema,
} from "@/modules/contact/schemas/product-request.schema";
import { Button, Input, Modal } from "@/UI";

interface Props {
	open: boolean;
	onClose: () => void;
	/** Окно закрылось полностью, анимация завершена — можно размонтировать. */
	onClosed?: () => void;
	product: { id: string; title: string };
	/** Стартовое количество — минимальная партия товара. */
	defaultQuantity: number;
}

/**
 * Заявка на товар, который сейчас нельзя купить.
 *
 * Не покупка и не оформление: товара нет, и форма это не маскирует —
 * заголовок называет действие («Заявка на товар»), а текст объясняет, что
 * будет дальше (перезвонит менеджер). Цены, корзины и «оформить» здесь нет.
 *
 * Состояния — как у формы на странице контактов (ContactForm):
 *  — заполнение: ошибки появляются после ухода с поля (mode "onTouched");
 *  — отправка: кнопка с вращением, форма aria-busy, окно не закрывается
 *    кликом мимо, повторная отправка невозможна (замок в ref);
 *  — сбой: сообщение над кнопкой, введённое не теряется;
 *  — успех: форма заменяется подтверждением на своём месте.
 *
 * Согласие на обработку ПДн обязательно — та же схема (literal(true))
 * проверяется на сервере, там же фиксируется время согласия.
 */
export function ProductRequestDialog({
	open,
	onClose,
	onClosed,
	product,
	defaultQuantity,
}: Props) {
	const [serverError, setServerError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);
	const inFlightRef = useRef(false);
	const consentId = useId();

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		getFieldState,
		formState: { errors, isSubmitting, isSubmitted },
	} = useForm<ProductRequestFormInput, unknown, ProductRequestFormData>({
		resolver: zodResolver(productRequestSchema),
		mode: "onTouched",
		defaultValues: {
			productId: product.id,
			name: "",
			phone: "",
			quantity: defaultQuantity,
			comment: "",
			consent: false as unknown as true,
		},
	});

	const phoneField = register("phone", {
		onChange: (event) => {
			// Маска подменяет значение уже после того, как react-hook-form
			// проверил сырой ввод. Без повторной проверки под полем оставалась
			// ошибка, посчитанная по промежуточному значению, хотя номер уже
			// набран полностью. До первого ухода с поля (mode "onTouched") не
			// проверяем — ругаться на человека, пока он печатает, не нужно.
			setValue("phone", formatRuPhoneInput(event.target.value), {
				shouldValidate: getFieldState("phone").isTouched || isSubmitted,
			});
		},
	});

	const onSubmit = async (data: ProductRequestFormData) => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		setServerError(null);
		try {
			const result = await submitProductRequestAction(data);
			if (result.success) {
				setSent(true);
				return;
			}
			setServerError(result.error);
		} catch {
			setServerError(
				"Не удалось отправить заявку. Проверьте соединение и попробуйте ещё раз.",
			);
		} finally {
			inFlightRef.current = false;
		}
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Заявка на товар"
			width={460}
			closeOnOverlay={!isSubmitting}
			closeOnEscape={!isSubmitting}
			afterClose={() => {
				// Следующее открытие — с чистого листа, но только после того,
				// как окно закрылось: иначе форма мигнула бы пустой в анимации.
				reset();
				setSent(false);
				setServerError(null);
				onClosed?.();
			}}
		>
			{sent ? (
				<div
					role="status"
					className="flex flex-col items-start gap-4 py-2 text-[var(--text-secondary)]"
				>
					<CheckCircle2
						className="size-8 text-[var(--success)]"
						aria-hidden="true"
					/>
					<div className="flex flex-col gap-1.5">
						<p className="text-[1rem] font-semibold text-[var(--text-primary)]">
							Заявка отправлена
						</p>
						<p className="text-[0.875rem] leading-relaxed">
							Менеджер перезвонит, чтобы обсудить «{product.title}»: сроки
							поставки или замену.
						</p>
					</div>
					<Button variant="secondary" size="md" onClick={onClose}>
						Закрыть
					</Button>
				</div>
			) : (
				<form
					onSubmit={handleSubmit(onSubmit)}
					noValidate
					aria-busy={isSubmitting}
					className="flex flex-col gap-4"
				>
					<p className="text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
						Сейчас «{product.title}» купить нельзя. Оставьте контакты — менеджер
						перезвонит и расскажет о сроках поставки или предложит замену.
					</p>

					<input type="hidden" {...register("productId")} />

					<Input
						label="Имя"
						autoComplete="name"
						placeholder="Как к вам обращаться"
						fullWidth
						errorMessage={errors.name?.message}
						{...register("name")}
					/>

					<Input
						label="Телефон"
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						placeholder="+7 (___) ___-__-__"
						fullWidth
						errorMessage={errors.phone?.message}
						{...phoneField}
					/>

					<Input
						label="Количество, шт."
						type="number"
						inputMode="numeric"
						min={PRODUCT_REQUEST_LIMITS.quantity.min}
						max={PRODUCT_REQUEST_LIMITS.quantity.max}
						step={1}
						fullWidth
						errorMessage={errors.quantity?.message}
						{...register("quantity")}
					/>

					<Input
						label="Комментарий"
						placeholder="Необязательно: сроки, аналоги, реквизиты"
						multiline
						rows={3}
						maxLength={PRODUCT_REQUEST_LIMITS.comment.max}
						fullWidth
						errorMessage={errors.comment?.message}
						{...register("comment")}
					/>

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor={consentId}
							className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]"
						>
							<input
								id={consentId}
								type="checkbox"
								className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
								aria-invalid={errors.consent ? "true" : undefined}
								aria-describedby={
									errors.consent ? `${consentId}-error` : undefined
								}
								{...register("consent")}
							/>
							<span>
								Согласен на{" "}
								<Link
									href={PERSONAL_DATA_CONSENT_HREF}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(event) => event.stopPropagation()}
									className="text-[var(--accent)] underline underline-offset-4"
								>
									обработку персональных данных
								</Link>
							</span>
						</label>
						{errors.consent ? (
							<p
								id={`${consentId}-error`}
								className="pl-[1.625rem] text-[0.8125rem] text-[var(--error)]"
							>
								{errors.consent.message}
							</p>
						) : null}
					</div>

					{serverError ? (
						<div
							role="alert"
							className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_9%,transparent)] px-3 py-2.5"
						>
							<AlertCircle
								className="mt-0.5 size-4 shrink-0 text-[var(--error)]"
								aria-hidden="true"
							/>
							<p className="text-[0.8125rem] leading-relaxed text-[var(--text-primary)]">
								{serverError}
							</p>
						</div>
					) : null}

					<div className="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="md"
							onClick={onClose}
							disabled={isSubmitting}
						>
							Отмена
						</Button>
						<Button
							type="submit"
							variant="primary"
							size="md"
							disabled={isSubmitting}
							className="gap-2"
						>
							{isSubmitting ? (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							) : null}
							{isSubmitting ? "Отправляем…" : "Отправить заявку"}
						</Button>
					</div>
				</form>
			)}
		</Modal>
	);
}
