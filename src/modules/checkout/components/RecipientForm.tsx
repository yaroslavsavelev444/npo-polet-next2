"use client";

import { Input } from "@/UI";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import { formatRuPhoneInput } from "../lib/phone";
import type { CheckoutRecipientInput } from "../types";

interface Props {
	value: CheckoutRecipientInput;
	onChange: (next: CheckoutRecipientInput) => void;
	/**
	 * Видимые ошибки формы. Считаются в одном месте (useCheckoutValidation) по
	 * той же схеме, что и на сервере: локальная копия правил здесь неизбежно
	 * разошлась бы с серверной, и форма то пропускала бы невалидные данные,
	 * то ругалась на валидные.
	 */
	errors: CheckoutFieldErrors;
	onFieldBlur: (path: string) => void;
}

export function RecipientForm({ value, onChange, errors, onFieldBlur }: Props) {
	return (
		<div className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-6">
			<h2 className="mb-5 text-base font-semibold text-(--text-primary)">
				Данные получателя
			</h2>

			<div className="flex flex-col gap-4">
				<Input
					id={CHECKOUT_FIELD_IDS.recipientFullName}
					label="ФИО получателя"
					autoComplete="name"
					value={value.fullName}
					onChange={(e) => onChange({ ...value, fullName: e.target.value })}
					onBlur={() => onFieldBlur("recipient.fullName")}
					placeholder="Иванов Иван Иванович"
					errorMessage={errors["recipient.fullName"]}
					helperText="Фамилия, имя и отчество получателя полностью"
					required
				/>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input
						id={CHECKOUT_FIELD_IDS.recipientPhone}
						label="Телефон"
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						value={value.phone}
						onChange={(e) =>
							onChange({ ...value, phone: formatRuPhoneInput(e.target.value) })
						}
						onBlur={() => onFieldBlur("recipient.phone")}
						placeholder="+7 (999) 123-45-67"
						errorMessage={errors["recipient.phone"]}
						required
					/>
					<Input
						id={CHECKOUT_FIELD_IDS.recipientEmail}
						label="Email"
						type="email"
						autoComplete="email"
						value={value.email}
						onChange={(e) => onChange({ ...value, email: e.target.value })}
						onBlur={() => onFieldBlur("recipient.email")}
						placeholder="ivanov@example.com"
						errorMessage={errors["recipient.email"]}
						required
					/>
				</div>

				<label className="flex cursor-pointer items-center gap-2.5 text-sm text-(--text-secondary)">
					<input
						type="checkbox"
						checked={value.saveRecipient}
						onChange={(e) =>
							onChange({ ...value, saveRecipient: e.target.checked })
						}
						className="h-4 w-4 shrink-0 accent-(--primary)"
					/>
					Сохранить данные получателя
				</label>
			</div>
		</div>
	);
}
