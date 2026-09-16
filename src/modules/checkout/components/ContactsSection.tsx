"use client";

import { AtSign, PhoneCall, User, UserRound } from "lucide-react";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import { formatRuPhoneInput, isValidRuPhone } from "../lib/phone";
import type {
	CheckoutContactPreference,
	CheckoutContactsFormValue,
} from "../types";
import styles from "./Checkout.module.css";
import { CheckboxRow, Disclosure, TextField } from "./fields";

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
 *
 * Два блока — «кто оформляет» и «получатель» — разделены линией и подписаны
 * служебным капслоком: это данные двух разных людей, и единственная защита от
 * путаницы здесь — не подсказка под полем, а видимая граница между ними.
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
		<>
			{/* ── Заказчик ─────────────────────────────────────────────────── */}
			<div className={styles.group}>
				<p className={styles.groupLabel}>
					<User size={13} aria-hidden />
					Кто оформляет заказ
				</p>

				<div className={styles.pair}>
					<TextField
						id={CHECKOUT_FIELD_IDS.customerPhone}
						label="Ваш телефон"
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						numeric
						leftIcon={<PhoneCall size={16} aria-hidden />}
						value={value.customerPhone}
						onChange={(e) =>
							update({ customerPhone: formatRuPhoneInput(e.target.value) })
						}
						onBlur={() => onFieldBlur("customer.phone")}
						placeholder="+7 (999) 123-45-67"
						error={errors["customer.phone"]}
						hint="По нему менеджер уточнит детали заказа"
						required
					/>
					<TextField
						id={CHECKOUT_FIELD_IDS.recipientEmail}
						label="Email"
						type="email"
						autoComplete="email"
						leftIcon={<AtSign size={16} aria-hidden />}
						value={value.email}
						onChange={(e) => update({ email: e.target.value })}
						onBlur={() => onFieldBlur("recipient.email")}
						placeholder="ivanov@example.com"
						error={errors["recipient.email"]}
						hint="Отправим подтверждение и статусы заказа"
						required
					/>
				</div>
			</div>

			{/* ── Получатель ───────────────────────────────────────────────── */}
			<div className={`${styles.group} ${styles.groupDivided}`}>
				<p className={styles.groupLabel}>
					<UserRound size={13} aria-hidden />
					Кто получит заказ
				</p>

				<TextField
					id={CHECKOUT_FIELD_IDS.recipientFullName}
					label="ФИО получателя"
					autoComplete="name"
					value={value.fullName}
					onChange={(e) => update({ fullName: e.target.value })}
					onBlur={() => onFieldBlur("recipient.fullName")}
					placeholder="Иванов Иван Иванович"
					error={errors["recipient.fullName"]}
					hint="Фамилия, имя и отчество полностью — по ним выдают заказ"
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

					<Disclosure open={value.hasSeparateRecipient}>
						<TextField
							id={CHECKOUT_FIELD_IDS.recipientPhone}
							label="Телефон получателя"
							type="tel"
							inputMode="tel"
							numeric
							optionalNote="необязательно"
							leftIcon={<PhoneCall size={16} aria-hidden />}
							value={value.recipientPhone}
							onChange={(e) =>
								update({ recipientPhone: formatRuPhoneInput(e.target.value) })
							}
							onBlur={() => onFieldBlur("recipient.phone")}
							placeholder="+7 (999) 123-45-67"
							error={errors["recipient.phone"]}
							hint="Пригодится курьеру при доставке"
						/>
					</Disclosure>
				</div>
			</div>

			{/* ── Кому звонить ─────────────────────────────────────────────── */}
			<div
				id={CHECKOUT_FIELD_IDS.contactPreference}
				className={`${styles.group} ${styles.groupDivided}`}
			>
				<p className={styles.groupLabel}>
					<PhoneCall size={13} aria-hidden />
					Связь по заказу
				</p>

				{canChoose ? (
					<>
						<p className={styles.sectionHint}>
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
							className={`${styles.options} ${styles.optionsPair} ${
								preferenceError ? styles.optionsInvalid : ""
							}`}
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
										data-selected={isActive || undefined}
										className={styles.option}
									>
										<span className={styles.optionMark} aria-hidden />
										<span className={styles.optionBody}>
											<span className={styles.optionTitle}>{option.title}</span>
											<span className={`${styles.optionText} tabular-nums`}>
												{option.phone}
											</span>
											<span className={styles.optionNote}>{option.hint}</span>
										</span>
									</button>
								);
							})}
						</div>
					</>
				) : (
					<p className={`${styles.notice} ${styles.noticeInfo}`}>
						<PhoneCall size={15} aria-hidden className={styles.noticeIcon} />
						<span>
							{!customerPhoneReady ? (
								"Укажите свой телефон — по нему менеджер уточнит детали заказа."
							) : value.hasSeparateRecipient ? (
								<>
									Менеджер позвонит вам на{" "}
									<strong className="tabular-nums">
										{value.customerPhone}
									</strong>
									. Заполните телефон получателя, если звонить нужно ему.
								</>
							) : (
								<>
									Менеджер позвонит вам на{" "}
									<strong className="tabular-nums">
										{value.customerPhone}
									</strong>
									, чтобы уточнить детали заказа.
								</>
							)}
						</span>
					</p>
				)}

				{preferenceError && (
					<p
						id={`${CHECKOUT_FIELD_IDS.contactPreference}-error`}
						role="alert"
						className={styles.fieldError}
					>
						{preferenceError}
					</p>
				)}
			</div>

			<div className={styles.groupDivided}>
				<CheckboxRow
					checked={value.saveRecipient}
					onChange={(checked) => update({ saveRecipient: checked })}
					note="Телефон, почта и ФИО подставятся в следующий заказ"
				>
					Сохранить контактные данные для следующих заказов
				</CheckboxRow>
			</div>
		</>
	);
}
