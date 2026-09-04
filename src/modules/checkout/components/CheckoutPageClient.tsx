"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import type { PromoApplyPreview } from "@/modules/promo";
import { PromoCodeField } from "@/modules/promo";
import { appToast } from "@/shared/lib/toast";
import { Button } from "@/UI";
import { submitOrderAction } from "../actions/checkout.actions";
import { useCheckoutValidation } from "../hooks/useCheckoutValidation";
import { normalizeAddress } from "../lib/address";
import {
	buildErrorEntries,
	findFirstErrorTarget,
	summarizeAddressErrors,
} from "../lib/checkout-fields";
import { focusCheckoutField } from "../lib/focus-field";
import {
	getAvailablePaymentMethods,
	getDefaultPaymentMethod,
	isPaymentMethodCompatible,
} from "../lib/payment-compatibility";
import { formatRuPhoneInput, normalizeRuPhone } from "../lib/phone";
import type {
	CheckoutCompanyInput,
	CheckoutContactsFormValue,
	CheckoutDeliveryInput,
	CheckoutPaymentMethod,
	CheckoutSubmitInput,
	CheckoutView,
} from "../types";
import { CheckoutErrorSummary } from "./CheckoutErrorSummary";
import { CompanySection } from "./CompanySection";
import { ContactsSection } from "./ContactsSection";
import { DeliveryMethodSelector } from "./DeliveryMethodSelector";
import { OrderConfirmationPanel } from "./OrderConfirmationPanel";
import { OrderItemsSummary } from "./OrderItemsSummary";
import { PaymentMethodSelector } from "./PaymentMethodSelector";

interface CheckoutPageClientProps {
	initialView: CheckoutView;
	user: { name: string; email: string };
}

export function CheckoutPageClient({
	initialView,
	user,
}: CheckoutPageClientProps) {
	const router = useRouter();
	const [isSubmitting, startSubmitting] = useTransition();

	const [contacts, setContacts] = useState<CheckoutContactsFormValue>(() => {
		const saved = initialView.savedRecipient;
		// Телефоны подставляются ТОЛЬКО из предпочтений, сохранённых уже после
		// разделения номеров (признак — заполненный customerPhone). У более
		// старых предпочтений известен один номер неизвестной принадлежности:
		// подставить его как «ваш телефон» значило бы с высокой вероятностью
		// снова направить менеджера на получателя — то есть вернуть ту самую
		// ошибку, ради которой номера и разделили.
		const restorePhones = Boolean(saved?.customerPhone);
		const recipientPhone = restorePhones ? (saved?.recipientPhone ?? "") : "";

		return {
			// ФИО НЕ подставляется из аккаунта — пользователь вводит получателя
			// вручную, либо оно приходит из ранее сохранённых (и уже
			// провалидированных) данных.
			fullName: saved?.fullName ?? "",
			email: saved?.email ?? user.email ?? "",
			customerPhone: restorePhones
				? formatRuPhoneInput(saved?.customerPhone ?? "")
				: "",
			recipientPhone: formatRuPhoneInput(recipientPhone),
			hasSeparateRecipient: recipientPhone !== "",
			// Безопасное значение по умолчанию: пока покупатель не выбрал иного,
			// звонить нужно тому, кто оформляет заказ и точно о нём знает.
			callPreference: "customer",
			saveRecipient: Boolean(saved),
		};
	});

	const [delivery, setDelivery] = useState<CheckoutDeliveryInput>(() => ({
		method: initialView.savedDelivery?.method ?? "self_pickup",
		address: normalizeAddress(initialView.savedDelivery?.address),
		transportCompanyId: initialView.savedDelivery?.transportCompanyId,
		pickupPointId: initialView.savedDelivery?.pickupPointId,
		notes: "",
		saveAddress: Boolean(initialView.savedDelivery),
	}));

	const [company, setCompany] = useState<CheckoutCompanyInput>({
		isCompany: false,
		saveCompany: false,
	});

	const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>(
		() =>
			getDefaultPaymentMethod(
				initialView.savedDelivery?.method ?? "self_pickup",
			),
	);
	const [notes, setNotes] = useState("");
	/**
	 * Применённый промокод.
	 *
	 * Хранится ровно здесь и нигде больше — ни в корзине, ни в сессии. Наружу
	 * уходит один только код: сумму скидки сервер пересчитывает сам, поэтому
	 * состояние формы физически не может повлиять на цену заказа.
	 */
	const [promo, setPromo] = useState<PromoApplyPreview | null>(null);
	// Ошибка, не привязанная ни к какому полю: сеть, пустая корзина, отказ
	// бизнес-логики. Живёт отдельно от ошибок полей, потому что исправляется
	// не правкой формы, а повторной попыткой.
	const [formError, setFormError] = useState<string | null>(null);
	const [addressManualMode, setAddressManualMode] = useState(
		// Подсказки не настроены — сразу показываем поля ручного ввода, чтобы
		// пользователь не искал, куда вводить адрес.
		!initialView.addressSuggestionsEnabled,
	);

	/**
	 * Полезная нагрузка ровно в том виде, в каком она уйдёт на сервер. Именно
	 * она валидируется на клиенте — иначе клиент проверял бы одни данные
	 * (телефон с маской), а сервер получал другие (E.164), и результаты
	 * расходились бы.
	 */
	const submitValue = useMemo<CheckoutSubmitInput>(
		() => ({
			customer: { phone: normalizeRuPhone(contacts.customerPhone) },
			recipient: {
				fullName: contacts.fullName,
				// Отдельный номер получателя существует только при включённом
				// переключателе: иначе получателем считается сам заказчик, и
				// второго номера у заказа нет.
				phone: contacts.hasSeparateRecipient
					? normalizeRuPhone(contacts.recipientPhone)
					: "",
				email: contacts.email,
				saveRecipient: contacts.saveRecipient,
			},
			contactPreference: contacts.callPreference,
			delivery,
			company: company.isCompany ? company : undefined,
			paymentMethod,
			notes,
			promoCode: promo?.code,
		}),
		[contacts, delivery, company, paymentMethod, notes, promo],
	);

	const validation = useCheckoutValidation(submitValue);
	const { visibleErrors, allErrors } = validation;

	const errorEntries = useMemo(
		() => buildErrorEntries(visibleErrors, { addressManualMode }),
		[visibleErrors, addressManualMode],
	);

	// В режиме подсказок адрес — одно поле, поэтому под ним показывается одно
	// сообщение вместо четырёх ошибок по компонентам.
	const addressSummaryError = useMemo(() => {
		if (addressManualMode) return undefined;
		const hasAddressError = Object.keys(visibleErrors).some((path) =>
			path.startsWith("delivery.address."),
		);
		return hasAddressError ? summarizeAddressErrors(visibleErrors) : undefined;
	}, [visibleErrors, addressManualMode]);

	const availablePaymentMethods = useMemo(
		() => getAvailablePaymentMethods(delivery.method),
		[delivery.method],
	);

	const handleDeliveryChange = useCallback(
		(next: CheckoutDeliveryInput) => {
			setDelivery(next);
			setFormError(null);
			if (!isPaymentMethodCompatible(next.method, paymentMethod)) {
				setPaymentMethod(getDefaultPaymentMethod(next.method));
			}
		},
		[paymentMethod],
	);

	// Повторные нажатия до завершения запроса создавали бы дубли заказов:
	// useTransition обновляет isSubmitting асинхронно, поэтому одного флага
	// состояния мало — нужен синхронный барьер.
	const inFlightRef = useRef(false);
	const [summaryFocusToken, setSummaryFocusToken] = useState(0);

	function revealErrors() {
		validation.revealAll();
		const entries = buildErrorEntries(allErrors, { addressManualMode });
		// Одна ошибка — вести пользователя списком из одного пункта незачем,
		// сразу ставим фокус в поле. Несколько — показываем сводку: она
		// объясняет объём работы лучше, чем прыжок в первое поле.
		if (entries.length === 1) {
			const target = findFirstErrorTarget(entries);
			if (target) focusCheckoutField(target);
			return;
		}
		setSummaryFocusToken((token) => token + 1);
	}

	function handleSubmit() {
		if (inFlightRef.current || isSubmitting) return;

		setFormError(null);

		if (!validation.isValid) {
			revealErrors();
			return;
		}

		inFlightRef.current = true;
		const submitted = submitValue;

		startSubmitting(async () => {
			try {
				const result = await submitOrderAction(submitted);

				if (result.success) {
					appToast.success(`Заказ №${result.data.orderNumber} оформлен`);
					router.push(`/orders/${result.data.orderNumber}`);
					// Флаг НЕ снимаем: страница уходит на успех, и повторное нажатие
					// во время навигации создало бы второй заказ.
					return;
				}

				inFlightRef.current = false;

				if (result.error === "AUTH_REQUIRED") {
					appToast.warning(result.message);
					router.push("/auth/login?from=/checkout");
					return;
				}

				if (result.error === "CART_EMPTY" || result.error === "CART_INVALID") {
					setFormError(result.message);
					appToast.warning(result.message);
					router.refresh();
					return;
				}

				if (result.error === "PROMO_INVALID") {
					// Промокод перестал действовать между «Применить» и
					// подтверждением. Он снимается — иначе следующая попытка
					// оформить заказ упиралась бы в тот же отказ, — но заказ при
					// этом НЕ отправляется автоматически: итог только что вырос,
					// и подтвердить новую сумму должен покупатель, а не мы за
					// него.
					setPromo(null);
					setFormError(result.message);
					appToast.warning(result.message);
					return;
				}

				if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
					validation.setServerErrors(result.fieldErrors, submitted);
					validation.revealAll();
					setSummaryFocusToken((token) => token + 1);
					return;
				}

				setFormError(result.message);
				appToast.warning(result.message);
			} catch (error) {
				// Сюда попадают сетевые сбои и падения Server Action: без
				// обработки они уходили бы в error boundary и уносили с собой всю
				// заполненную форму.
				console.error("[checkout] submit failed:", error);
				inFlightRef.current = false;
				const message =
					"Не удалось отправить заказ — проверьте соединение и попробуйте ещё раз";
				setFormError(message);
				appToast.warning(message);
			}
		});
	}

	const cartIssue = initialView.cart.validation.isValid
		? null
		: (initialView.cart.validation.issues[0]?.message ??
			"Проверьте количество товаров в корзине");

	return (
		<div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="mb-6 text-2xl font-semibold text-(--text-primary) sm:text-3xl">
				Оформление заказа
			</h1>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div className="flex flex-col gap-6 lg:col-span-2">
					<OrderItemsSummary items={initialView.cart.items} />

					<DeliveryMethodSelector
						value={delivery}
						onChange={handleDeliveryChange}
						pickupPoints={initialView.pickupPoints}
						transportCompanies={initialView.transportCompanies}
						errors={visibleErrors}
						addressSummaryError={addressSummaryError}
						onFieldBlur={validation.markTouched}
						suggestionsEnabled={initialView.addressSuggestionsEnabled}
						addressManualMode={addressManualMode}
						onAddressManualModeChange={setAddressManualMode}
					/>

					<ContactsSection
						value={contacts}
						onChange={(next) => {
							setContacts(next);
							setFormError(null);
						}}
						errors={visibleErrors}
						onFieldBlur={validation.markTouched}
					/>

					<CompanySection
						value={company}
						onChange={setCompany}
						companies={initialView.companies}
						errors={visibleErrors}
						onFieldBlur={validation.markTouched}
					/>

					<PaymentMethodSelector
						value={paymentMethod}
						onChange={setPaymentMethod}
						available={availablePaymentMethods}
						error={visibleErrors.paymentMethod}
					/>

					<div className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-6">
						<label
							htmlFor="order-notes"
							className="mb-2 block text-sm font-medium text-(--text-primary)"
						>
							Комментарий к заказу
						</label>
						<textarea
							id="order-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={3}
							maxLength={1000}
							className="w-full rounded-[var(--radius-sm)] border border-(--border) bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-(--primary)"
							placeholder="Необязательно"
						/>
					</div>
				</div>

				<div className="lg:col-span-1">
					<div className="sticky top-24 flex flex-col gap-4">
						{/* Поле стоит рядом с итогом, а не среди полей доставки:
						    промокод меняет именно сумму, и результат его применения
						    должен быть виден в том же взгляде, что и само поле. */}
						<PromoCodeField
							applied={promo}
							onAppliedChange={(next) => {
								setPromo(next);
								setFormError(null);
							}}
							disabled={
								initialView.cart.items.length === 0 ||
								!initialView.cart.validation.isValid
							}
						/>

						<OrderConfirmationPanel
							cart={initialView.cart}
							contacts={contacts}
							delivery={delivery}
							company={company}
							paymentMethod={paymentMethod}
							notes={notes}
							pickupPoints={initialView.pickupPoints}
							transportCompanies={initialView.transportCompanies}
							promo={promo}
						/>

						{cartIssue && (
							<p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--warning)/40 bg-(--warning)/8 p-3 text-sm text-(--warning)">
								<AlertTriangle
									className="mt-0.5 h-4 w-4 shrink-0"
									aria-hidden
								/>
								{cartIssue}
							</p>
						)}

						<CheckoutErrorSummary
							entries={errorEntries}
							focusOnAppear={summaryFocusToken > 0}
							key={summaryFocusToken}
						/>

						{formError && (
							<p
								role="alert"
								className="flex items-start gap-2 rounded-[var(--radius-md)] border border-(--error)/40 bg-(--error)/8 p-3 text-sm text-(--error)"
							>
								<AlertTriangle
									className="mt-0.5 h-4 w-4 shrink-0"
									aria-hidden
								/>
								{formError}
							</p>
						)}

						<Button
							variant="primary"
							size="lg"
							fullWidth
							// Кнопка НЕ блокируется при невалидной форме: заблокированная
							// кнопка не объясняет, чего не хватает, и пользователь остаётся
							// без обратной связи. Вместо этого нажатие показывает список
							// ошибок и уводит к первому полю.
							disabled={isSubmitting}
							loading={isSubmitting}
							onClick={handleSubmit}
						>
							Подтвердить заказ
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
