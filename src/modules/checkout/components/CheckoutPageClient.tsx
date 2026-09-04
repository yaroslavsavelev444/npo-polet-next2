"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
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
	CheckoutDeliveryInput,
	CheckoutPaymentMethod,
	CheckoutRecipientInput,
	CheckoutSubmitInput,
	CheckoutView,
} from "../types";
import { CheckoutErrorSummary } from "./CheckoutErrorSummary";
import { CompanySection } from "./CompanySection";
import { DeliveryMethodSelector } from "./DeliveryMethodSelector";
import { OrderConfirmationPanel } from "./OrderConfirmationPanel";
import { OrderItemsSummary } from "./OrderItemsSummary";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { RecipientForm } from "./RecipientForm";

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

	const [recipient, setRecipient] = useState<CheckoutRecipientInput>({
		// ФИО НЕ подставляется из аккаунта — пользователь вводит получателя вручную,
		// либо оно приходит из ранее сохранённых (и уже провалидированных) данных.
		fullName: initialView.savedRecipient?.fullName ?? "",
		phone: formatRuPhoneInput(initialView.savedRecipient?.phone ?? ""),
		email: initialView.savedRecipient?.email ?? user.email ?? "",
		saveRecipient: Boolean(initialView.savedRecipient),
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
			recipient: { ...recipient, phone: normalizeRuPhone(recipient.phone) },
			delivery,
			company: company.isCompany ? company : undefined,
			paymentMethod,
			notes,
		}),
		[recipient, delivery, company, paymentMethod, notes],
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

					<RecipientForm
						value={recipient}
						onChange={(next) => {
							setRecipient(next);
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
						<OrderConfirmationPanel
							cart={initialView.cart}
							recipient={recipient}
							delivery={delivery}
							company={company}
							paymentMethod={paymentMethod}
							notes={notes}
							pickupPoints={initialView.pickupPoints}
							transportCompanies={initialView.transportCompanies}
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
