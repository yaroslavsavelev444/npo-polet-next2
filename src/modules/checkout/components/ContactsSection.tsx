"use client";

import { PhoneCall } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/UI";
import { cn } from "@/utils/cn";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import { formatRuPhoneInput, isValidRuPhone } from "../lib/phone";
import type {
	CheckoutContactPreference,
	CheckoutContactsFormValue,
} from "../types";

/**
 * Контакты заказа: телефон заказчика, данные получателя и выбор номера,
 * по которому менеджер уточняет заказ.
 *
 * Раньше здесь было одно поле «Телефон» — и оно означало сразу две разные
 * вещи. Люди вводили туда номер получателя (заказ часто оформляют не себе),
 * а менеджер звонил именно по нему — то есть человеку, который о заказе мог
 * не знать. Разделение решает это на уровне интерфейса, а не инструкций:
 *
 *  • «Ваш телефон» стоит первым и обязателен — за ним всегда стоит человек,
 *    знающий о заказе;
 *  • телефон получателя появляется только после явного «заказ получит другой
 *    человек», поэтому в самом частом случае форма не выросла ни на строку;
 *  • выбор номера для связи показывается ровно тогда, когда номеров
 *    действительно два. Пока второго номера нет, выбирать не из чего — вместо
 *    неактивного переключателя блок прямым текстом говорит, кому позвонят.
 *
 * Противоречивое состояние («звонить получателю», у которого нет номера)
 * недостижимо: любое изменение проходит через update(), где выбор
 * возвращается к номеру заказчика в тот же момент, когда второй номер
 * пропадает.
 */

interface Props {
	value: CheckoutContactsFormValue;
	onChange: (next: CheckoutContactsFormValue) => void;
	/**
	 * Видимые ошибки формы. Считаются в одном месте (useCheckoutValidation) по
	 * той же схеме, что и на сервере: локальная копия правил здесь неизбежно
	 * разошлась бы с серверной, и форма то пропускала бы невалидные данные,
	 * то ругалась на валидные.
	 */
	errors: CheckoutFieldErrors;
	onFieldBlur: (path: string) => void;
}

function BlockLabel({ children }: { children: ReactNode }) {
	return (
		<p className="text-xs font-medium uppercase tracking-wider text-(--text-secondary)">
			{children}
		</p>
	);
}

function CheckboxRow({
	checked,
	onChange,
	children,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: ReactNode;
}) {
	return (
		<label className="flex cursor-pointer items-center gap-2.5 text-sm text-(--text-secondary)">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="h-4 w-4 shrink-0 accent-(--primary)"
			/>
			{children}
		</label>
	);
}

export function ContactsSection({
	value,
	onChange,
	errors,
	onFieldBlur,
}: Props) {
	const customerPhoneReady = isValidRuPhone(value.customerPhone);
	const recipientPhoneReady =
		value.hasSeparateRecipient && isValidRuPhone(value.recipientPhone);
	// Выбор предлагается только когда номера действительно два. Недобранный
	// номер («+7 (999) 12») ещё не существует, и предлагать звонить на него
	// значит позволить выбрать несуществующий контакт.
	const canChoose = customerPhoneReady && recipientPhoneReady;
	const preferenceError = errors.contactPreference;

	function update(patch: Partial<CheckoutContactsFormValue>) {
		const next = { ...value, ...patch };

		// Снятый переключатель — это утверждение «получаю сам». Оставлять при
		// нём введённый ранее номер получателя нельзя: он не отправляется и не
		// виден, но продолжал бы существовать в состоянии формы.
		if (!next.hasSeparateRecipient) next.recipientPhone = "";

		if (
			next.callPreference === "recipient" &&
			!isValidRuPhone(next.recipientPhone)
		) {
			next.callPreference = "customer";
		}

		onChange(next);
	}

	const options: {
		value: CheckoutContactPreference;
		title: string;
		phone: string;
		hint: string;
	}[] = [
		{
			value: "customer",
			title: "Мне",
			phone: value.customerPhone,
			hint: "Вы оформляете заказ",
		},
		{
			value: "recipient",
			title: "Получателю",
			phone: value.recipientPhone,
			hint: value.fullName.trim() || "Получатель заказа",
		},
	];

	return (
		<div className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-6">
			{/* mb-5 сохранено для единообразия с остальными карточками формы, но
			    реально не работает: глобальные стили обнуляют внешние отступы
			    заголовков (то же самое у «Способ получения» и «Способ оплаты»).
			    Поэтому отступ до первого блока задаёт сам блок — иначе подпись
			    «Кто оформляет заказ» прилипает к заголовку карточки и читается
			    как его вторая строка. */}
			<h2 className="mb-5 text-base font-semibold text-(--text-primary)">
				Контактные данные
			</h2>

			{/* ── Заказчик ─────────────────────────────────────────────────── */}
			<div className="mt-6 flex flex-col gap-4">
				<BlockLabel>Кто оформляет заказ</BlockLabel>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input
						id={CHECKOUT_FIELD_IDS.customerPhone}
						label="Ваш телефон"
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						value={value.customerPhone}
						onChange={(e) =>
							update({ customerPhone: formatRuPhoneInput(e.target.value) })
						}
						onBlur={() => onFieldBlur("customer.phone")}
						placeholder="+7 (999) 123-45-67"
						errorMessage={errors["customer.phone"]}
						helperText="Номер человека, который оформляет заказ"
						required
					/>
					<Input
						id={CHECKOUT_FIELD_IDS.recipientEmail}
						label="Email"
						type="email"
						autoComplete="email"
						value={value.email}
						onChange={(e) => update({ email: e.target.value })}
						onBlur={() => onFieldBlur("recipient.email")}
						placeholder="ivanov@example.com"
						errorMessage={errors["recipient.email"]}
						helperText="Отправим подтверждение и статусы заказа"
						required
					/>
				</div>
			</div>

			{/* ── Получатель ───────────────────────────────────────────────── */}
			<div className="mt-6 flex flex-col gap-4 border-t border-(--border) pt-6">
				<BlockLabel>Получатель</BlockLabel>

				<Input
					id={CHECKOUT_FIELD_IDS.recipientFullName}
					label="ФИО получателя"
					autoComplete="name"
					value={value.fullName}
					onChange={(e) => update({ fullName: e.target.value })}
					onBlur={() => onFieldBlur("recipient.fullName")}
					placeholder="Иванов Иван Иванович"
					errorMessage={errors["recipient.fullName"]}
					helperText="Фамилия, имя и отчество получателя полностью"
					required
				/>

				{/* Переключатель и раскрывающееся поле — одна группа БЕЗ общего
				    зазора: в колонке с gap свёрнутый блок нулевой высоты всё
				    равно получал бы отступы с обеих сторон и оставлял пустоту
				    там, где ничего нет. Отступ поля живёт внутри блока и
				    исчезает вместе с ним. */}
				<div className="flex flex-col">
					<CheckboxRow
						checked={value.hasSeparateRecipient}
						onChange={(checked) => update({ hasSeparateRecipient: checked })}
					>
						Заказ получит другой человек
					</CheckboxRow>

					{/* Поле раскрывается по высоте, а не появляется рывком. Свёрнутый
					    блок помечен inert: иначе скрытое поле оставалось бы в порядке
					    табуляции и в дереве доступности. */}
					<div
						inert={!value.hasSeparateRecipient}
						className={cn(
							"grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
							value.hasSeparateRecipient
								? "grid-rows-[1fr] opacity-100"
								: "grid-rows-[0fr] opacity-0",
						)}
					>
						<div className="overflow-hidden pt-4">
							<Input
								id={CHECKOUT_FIELD_IDS.recipientPhone}
								label="Телефон получателя"
								type="tel"
								inputMode="tel"
								value={value.recipientPhone}
								onChange={(e) =>
									update({ recipientPhone: formatRuPhoneInput(e.target.value) })
								}
								onBlur={() => onFieldBlur("recipient.phone")}
								placeholder="+7 (999) 123-45-67"
								errorMessage={errors["recipient.phone"]}
								helperText="Необязательно. Пригодится курьеру при доставке"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* ── Кому звонить ─────────────────────────────────────────────── */}
			<div
				id={CHECKOUT_FIELD_IDS.contactPreference}
				className="mt-6 flex flex-col gap-3 border-t border-(--border) pt-6"
			>
				<BlockLabel>Связь по заказу</BlockLabel>

				{canChoose ? (
					<>
						<p className="-mt-1 text-sm text-(--text-secondary)">
							По какому номеру менеджеру звонить, чтобы уточнить заказ?
						</p>
						<div
							role="radiogroup"
							aria-label="Номер для связи по заказу"
							aria-invalid={preferenceError ? true : undefined}
							aria-describedby={
								preferenceError
									? `${CHECKOUT_FIELD_IDS.contactPreference}-error`
									: undefined
							}
							className={cn(
								"grid grid-cols-1 gap-2 rounded-[var(--radius-md)] sm:grid-cols-2",
								preferenceError && "p-2 outline outline-1 outline-(--error)/50",
							)}
						>
							{options.map((option) => {
								const isActive = value.callPreference === option.value;
								return (
									<button
										key={option.value}
										type="button"
										role="radio"
										aria-checked={isActive}
										onClick={() => update({ callPreference: option.value })}
										className={cn(
											"flex items-start gap-3 rounded-[var(--radius-md)] border p-3.5 text-left transition-colors duration-150",
											isActive
												? "border-(--primary) bg-(--primary)/8"
												: "border-(--border) hover:border-(--border-light) hover:bg-(--surface-secondary)",
										)}
									>
										<span
											aria-hidden
											className={cn(
												"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
												isActive
													? "border-(--primary)"
													: "border-(--border-light)",
											)}
										>
											<span
												className={cn(
													"h-2 w-2 rounded-full bg-(--primary) transition-transform duration-150 ease-out",
													isActive ? "scale-100" : "scale-0",
												)}
											/>
										</span>
										<span className="flex min-w-0 flex-col gap-0.5">
											<span className="text-sm font-medium text-(--text-primary)">
												{option.title}
											</span>
											<span className="text-sm tabular-nums text-(--text-primary)">
												{option.phone}
											</span>
											<span className="truncate text-xs text-(--text-secondary)">
												{option.hint}
											</span>
										</span>
									</button>
								);
							})}
						</div>
					</>
				) : (
					<p className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-(--border) px-4 py-3 text-sm text-(--text-secondary)">
						<PhoneCall
							className="mt-0.5 h-4 w-4 shrink-0 text-(--text-muted)"
							aria-hidden
						/>
						<span>
							{!customerPhoneReady ? (
								"Укажите свой телефон — по нему менеджер уточнит детали заказа."
							) : value.hasSeparateRecipient ? (
								<>
									Менеджер позвонит вам на{" "}
									<span className="font-medium tabular-nums text-(--text-primary)">
										{value.customerPhone}
									</span>
									. Заполните телефон получателя, если звонить нужно ему.
								</>
							) : (
								<>
									Менеджер позвонит вам на{" "}
									<span className="font-medium tabular-nums text-(--text-primary)">
										{value.customerPhone}
									</span>
									, чтобы уточнить детали заказа.
								</>
							)}
						</span>
					</p>
				)}

				{preferenceError && (
					<p
						id={`${CHECKOUT_FIELD_IDS.contactPreference}-error`}
						className="text-xs leading-none text-(--error)"
					>
						{preferenceError}
					</p>
				)}
			</div>

			<div className="mt-6 border-t border-(--border) pt-6">
				<CheckboxRow
					checked={value.saveRecipient}
					onChange={(checked) => update({ saveRecipient: checked })}
				>
					Сохранить контактные данные для следующих заказов
				</CheckboxRow>
			</div>
		</div>
	);
}
