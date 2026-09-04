import type { CartView } from "@/modules/cart";
import { formatPrice } from "@/modules/productCard";
import type { PromoApplyPreview } from "@/modules/promo";
import { formatAddress, hasHouseLevelPrecision } from "../lib/address";
import { isValidRuPhone } from "../lib/phone";
import type {
	CheckoutCompanyInput,
	CheckoutContactsFormValue,
	CheckoutDeliveryInput,
	CheckoutPaymentMethod,
	PickupPointOption,
	TransportCompanyOption,
} from "../types";

const DELIVERY_LABELS: Record<CheckoutDeliveryInput["method"], string> = {
	door_to_door: "Курьер до двери",
	pickup_point: "Доставка в ПВЗ",
	self_pickup: "Самовывоз",
};

const PAYMENT_LABELS: Record<CheckoutPaymentMethod, string> = {
	invoice: "По счету",
	self_pickup_card: "Картой при самовывозе",
	self_pickup_cash: "Наличными при самовывозе",
};

interface Props {
	cart: CartView;
	contacts: CheckoutContactsFormValue;
	delivery: CheckoutDeliveryInput;
	company: CheckoutCompanyInput;
	paymentMethod: CheckoutPaymentMethod;
	notes: string;
	pickupPoints: PickupPointOption[];
	transportCompanies: TransportCompanyOption[];
	/**
	 * Применённый промокод. Итоговые суммы берутся из него, а не из корзины:
	 * корзина о промокоде не знает вовсе, и складывать её итог со скидкой
	 * кода прямо здесь значило бы завести вторую реализацию порядка
	 * применения скидок — рядом с той, что работает на сервере.
	 */
	promo: PromoApplyPreview | null;
}

export function OrderConfirmationPanel({
	cart,
	contacts,
	delivery,
	company,
	paymentMethod,
	notes,
	pickupPoints,
	transportCompanies,
	promo,
}: Props) {
	// Та же функция, что и на странице заказа: подтверждение обязано показывать
	// ровно тот адрес, который потом увидит покупатель в заказе.
	//
	// Пока адрес не определён до дома, в поле поиска лежит просто набранный
	// текст («москва ленина»), и выводить его как «Адрес» нельзя: итоговая
	// панель — это то, что пользователь подтверждает, и показывать там
	// незавершённый ввод как готовое значение значит вводить в заблуждение.
	// Номер, по которому будет звонить менеджер. Считается ровно так же, как на
	// сервере (resolveOrderContact): выбор «получателю» без его номера
	// невозможен, поэтому здесь достаточно проверить наличие номера.
	// Недобранный номер («+7 (999) 12») ещё не номер: показывать его в итоге
	// как контакт получателя значит подтверждать несуществующий телефон.
	const hasRecipientPhone =
		contacts.hasSeparateRecipient && isValidRuPhone(contacts.recipientPhone);
	const callsRecipient =
		contacts.callPreference === "recipient" && hasRecipientPhone;
	const contactPhone = callsRecipient
		? contacts.recipientPhone
		: contacts.customerPhone;
	const callTargetLabel = callsRecipient ? "получателю" : "вам";
	// Номер получателя показывается отдельной строкой, только если он не тот
	// же, что и номер для связи: иначе итог дважды повторял бы одно число.
	const showRecipientPhone = hasRecipientPhone && !callsRecipient;

	// Итог с промокодом приходит уже посчитанным с сервера — тем же расчётом,
	// который будет применён к заказу. Пересчитывать его здесь нельзя: это
	// была бы вторая реализация правил, и разойтись с серверной она могла бы
	// незаметно, показав покупателю не ту цену, которую он заплатит.
	const total = promo ? promo.total : cart.summary.totalPrice;
	// Все прочие скидки, кроме промокода: товарные плюс центральная (которую
	// промокод мог и вытеснить — тогда она уже нулевая).
	const otherDiscount = promo
		? Math.max(0, promo.totalDiscount - promo.discountAmount)
		: cart.summary.totalDiscount;

	const isAddressResolved = hasHouseLevelPrecision(delivery.address ?? {});
	const deliveryAddressText = isAddressResolved
		? formatAddress(delivery.address, {
				withUnitDetails: delivery.method === "door_to_door",
			})
		: "";
	const pickupPoint = pickupPoints.find((p) => p.id === delivery.pickupPointId);
	const transportCompany = transportCompanies.find(
		(t) => t.id === delivery.transportCompanyId,
	);

	return (
		<div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
			<h2 className="text-lg font-semibold text-[var(--text-primary)]">
				Итог заказа
			</h2>

			<div className="flex flex-col gap-1 text-sm">
				<Row label="Получатель" value={contacts.fullName || "—"} />
				<Row label="Email" value={contacts.email || "—"} />
				{/* Итог обязан показывать не «телефон», а ответ на вопрос «куда
				    позвонят»: именно эта величина уходит менеджеру, и подтверждать
				    пользователь должен её, а не набор номеров. */}
				<Row
					label="Звонок по заказу"
					value={
						contactPhone
							? `${contactPhone} — ${callTargetLabel}`
							: "Укажите телефон"
					}
				/>
				{showRecipientPhone && (
					<Row label="Телефон получателя" value={contacts.recipientPhone} />
				)}
			</div>

			<div className="h-px bg-[var(--border)]" />

			<div className="flex flex-col gap-1 text-sm">
				<Row label="Доставка" value={DELIVERY_LABELS[delivery.method]} />
				{delivery.method === "door_to_door" && deliveryAddressText && (
					<Row label="Адрес" value={deliveryAddressText} />
				)}
				{delivery.method === "pickup_point" && deliveryAddressText && (
					<Row label="Адрес ПВЗ" value={deliveryAddressText} />
				)}
				{transportCompany && (
					<Row label="Компания" value={transportCompany.name} />
				)}
				{pickupPoint && <Row label="Пункт выдачи" value={pickupPoint.name} />}
				{delivery.notes && <Row label="Комментарий" value={delivery.notes} />}
			</div>

			{company.isCompany && (
				<>
					<div className="h-px bg-[var(--border)]" />
					<div className="flex flex-col gap-1 text-sm">
						<Row label="Компания" value={company.companyName || "—"} />
						<Row label="ИНН" value={company.taxNumber || "—"} />
					</div>
				</>
			)}

			<div className="h-px bg-[var(--border)]" />

			<Row label="Способ оплаты" value={PAYMENT_LABELS[paymentMethod]} />
			{notes && <Row label="Комментарий к заказу" value={notes} />}

			<div className="h-px bg-[var(--border)]" />

			<div className="flex items-center justify-between text-sm">
				<span className="text-[var(--text-secondary)]">
					Товары ({cart.summary.totalItems} шт.)
				</span>
				<span className="font-medium text-[var(--text-primary)]">
					{formatPrice(cart.summary.priceWithoutDiscount)}
				</span>
			</div>

			{/* Скидка промокода показывается ОТДЕЛЬНОЙ строкой, а не растворяется
			    в общей «Скидке». Покупатель только что совершил действие и должен
			    увидеть его результат: сумма, слитая с прочими скидками, не
			    отвечает на вопрос «а промокод-то сработал?». */}
			{promo ? (
				<>
					{otherDiscount > 0 && (
						<div className="flex items-center justify-between text-sm">
							<span className="text-[var(--success)]">Скидка</span>
							<span className="font-medium text-[var(--success)]">
								-{formatPrice(otherDiscount)}
							</span>
						</div>
					)}
					<div className="flex items-center justify-between text-sm">
						<span className="text-[var(--success)]">
							Промокод{" "}
							<span className="font-mono tracking-wide">{promo.code}</span>
						</span>
						<span className="font-medium text-[var(--success)]">
							-{formatPrice(promo.discountAmount)}
						</span>
					</div>
				</>
			) : (
				cart.summary.totalDiscount > 0 && (
					<div className="flex items-center justify-between text-sm">
						<span className="text-[var(--success)]">Скидка</span>
						<span className="font-medium text-[var(--success)]">
							-{formatPrice(cart.summary.totalDiscount)}
						</span>
					</div>
				)
			)}

			<div className="flex items-center justify-between">
				<span className="text-lg font-semibold text-[var(--text-primary)]">
					Итого
				</span>
				<span className="text-2xl font-bold text-[var(--primary)]">
					{formatPrice(total)}
				</span>
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="shrink-0 text-[var(--text-secondary)]">{label}</span>
			{/* Адрес и ФИО бывают длиннее колонки: truncate прятал их целиком,
          и пользователь не мог проверить, что подтверждает. */}
			<span className="min-w-0 break-words text-right text-[var(--text-primary)]">
				{value}
			</span>
		</div>
	);
}
