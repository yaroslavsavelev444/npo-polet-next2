"use client";

import {
	AlertTriangle,
	Building2,
	CreditCard,
	Loader2,
	MapPin,
	PhoneCall,
	Receipt,
	ShieldCheck,
	Truck,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { formatPrice } from "@/modules/productCard";
import { formatAddress, hasHouseLevelPrecision } from "../lib/address";
import type { CheckoutErrorEntry } from "../lib/checkout-fields";
import {
	DELIVERY_METHOD_LABELS,
	DELIVERY_OPTIONS,
	PAYMENT_METHOD_LABELS,
} from "../lib/checkout-labels";
import type { CheckoutTotals } from "../lib/checkout-totals";
import { isValidRuPhone } from "../lib/phone";
import type {
	CheckoutCompanyInput,
	CheckoutContactsFormValue,
	CheckoutDeliveryInput,
	CheckoutPaymentMethod,
	PickupPointOption,
	TransportCompanyOption,
} from "../types";
import styles from "./Checkout.module.css";
import { CheckoutErrorSummary } from "./CheckoutErrorSummary";

interface Props {
	totals: CheckoutTotals;
	contacts: CheckoutContactsFormValue;
	delivery: CheckoutDeliveryInput;
	company: CheckoutCompanyInput;
	paymentMethod: CheckoutPaymentMethod;
	pickupPoints: PickupPointOption[];
	transportCompanies: TransportCompanyOption[];
	/** Поле промокода — приходит снаружи, чтобы панель не знала о модуле промо. */
	promoField: ReactNode;
	/** Идёт пересчёт корзины — показанные суммы относятся к прошлому составу. */
	isStale: boolean;
	isSubmitting: boolean;
	onSubmit: () => void;
	errorEntries: CheckoutErrorEntry[];
	/** Ошибка, не привязанная к полю: сеть, пустая корзина, отказ сервера. */
	formError: string | null;
	/** Корзина не проходит проверку (минимальные партии). */
	cartIssue: string | null;
	/** Счётчик попыток отправки — по нему сводка ошибок забирает фокус. */
	summaryFocusToken: number;
	/** Узел панели — по нему липкая полоса решает, показываться ли. */
	panelRef?: Ref<HTMLDivElement>;
}

/**
 * Колонка денег: сколько выходит, из чего складывается и что будет дальше.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРОЗРАЧНОСТЬ СТОИМОСТИ
 * ────────────────────────────────────────────────────────────────────────────
 * Каждая уступка названа своим именем и стоит отдельной строкой: скидка на
 * товары, акция корзины (со своим названием и процентом), промокод (со своим
 * кодом). Раньше все три сливались в одну безымянную «Скидку», по которой
 * нельзя было проверить ни то, что промокод сработал, ни то, куда делась
 * акция, обещанная в корзине.
 *
 * Все величины приходят из `buildCheckoutTotals` — он ничего не считает, а
 * раскладывает уже посчитанный сервером итог. Если разбор почему-либо не
 * сходится с итогом до копейки, показывается одна честная строка «Скидка»
 * вместо слагаемых, которые не складываются (см. `breakdownIsExact`).
 *
 * Строка «Доставка» показывает не цифру, а условие: в этом магазине доставку
 * считает перевозчик по своему тарифу уже после оформления, и в заказ она
 * пишется нулём. «0 ₽» на её месте было бы обещанием бесплатной доставки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СВЕРКА ПЕРЕД ПОДТВЕРЖДЕНИЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * Под расчётом — ответы на четыре вопроса, которые в форме разнесены на три
 * экрана: кто получит, куда везём, кому звонить, чем платим. Это не повтор
 * формы: значения показаны в том виде, в каком они уйдут в заказ, а
 * незаполненные честно помечены прочерком, а не пропущены.
 */
export function OrderSummaryPanel({
	totals,
	contacts,
	delivery,
	company,
	paymentMethod,
	pickupPoints,
	transportCompanies,
	promoField,
	isStale,
	isSubmitting,
	onSubmit,
	errorEntries,
	formError,
	cartIssue,
	summaryFocusToken,
	panelRef,
}: Props) {
	// Номер, по которому будет звонить менеджер. Считается ровно так же, как на
	// сервере (resolveOrderContact): выбор «получателю» без его номера
	// невозможен, поэтому здесь достаточно проверить наличие номера.
	// Недобранный номер («+7 (999) 12») ещё не номер: показывать его в итоге
	// как контакт значит подтверждать несуществующий телефон.
	const hasRecipientPhone =
		contacts.hasSeparateRecipient && isValidRuPhone(contacts.recipientPhone);
	const callsRecipient =
		contacts.callPreference === "recipient" && hasRecipientPhone;
	const contactPhone = callsRecipient
		? contacts.recipientPhone
		: isValidRuPhone(contacts.customerPhone)
			? contacts.customerPhone
			: "";

	// Пока адрес не определён до дома, в поле поиска лежит просто набранный
	// текст («москва ленина»), и выводить его как «Адрес» нельзя: сверка — это
	// то, что пользователь подтверждает, и незавершённый ввод в ней читался бы
	// как готовое значение.
	const isAddressResolved = hasHouseLevelPrecision(delivery.address ?? {});
	const addressText = isAddressResolved
		? formatAddress(delivery.address, {
				withUnitDetails: delivery.method === "door_to_door",
			})
		: "";
	const pickupPoint = pickupPoints.find(
		(point) => point.id === delivery.pickupPointId,
	);
	const transportCompany = transportCompanies.find(
		(item) => item.id === delivery.transportCompanyId,
	);

	const deliveryLines = [
		DELIVERY_METHOD_LABELS[delivery.method],
		delivery.method === "self_pickup"
			? (pickupPoint && `${pickupPoint.name}, ${pickupPoint.address}`) || null
			: [transportCompany?.name, addressText].filter(Boolean).join(" · ") ||
				null,
	].filter(Boolean) as string[];

	return (
		<div className={styles.summary} ref={panelRef}>
			{promoField}

			<h2 className={styles.summaryTitle}>
				<span className="flex items-center gap-[0.4rem]">
					<Receipt size={13} aria-hidden />
					Стоимость
				</span>
				{isStale && (
					<span className={styles.optional} aria-hidden>
						пересчёт…
					</span>
				)}
			</h2>

			{/* Суммы — список определений: подпись и значение связаны разметкой,
			    а не только расположением на экране. */}
			<dl className={styles.sum} aria-busy={isStale || undefined}>
				<div className={styles.sumRow}>
					<dt className={styles.sumLabel}>
						Товары
						<span className={styles.optional}>{totals.itemsQuantity} шт.</span>
					</dt>
					<dd className={styles.sumValue}>{formatPrice(totals.subtotal)}</dd>
				</div>

				{totals.breakdownIsExact ? (
					totals.discounts.map((line) => (
						<div
							key={line.kind}
							className={`${styles.sumRow} ${styles.sumDiscount}`}
						>
							<dt className={styles.sumLabel}>
								{line.label}
								{line.code && (
									<span className={styles.sumCode}>{line.code}</span>
								)}
								{line.percent !== null && line.percent > 0 && (
									<span className={styles.sumBadge}>−{line.percent}%</span>
								)}
							</dt>
							<dd className={styles.sumValue}>−{formatPrice(line.amount)}</dd>
						</div>
					))
				) : totals.totalDiscount > 0 ? (
					// Разбор не сошёлся с итогом (скидки упёрлись в сумму заказа и
					// были ограничены сервером). Показываем одну величину, в
					// которой нельзя ошибиться: разницу между товарами и итогом.
					<div className={`${styles.sumRow} ${styles.sumDiscount}`}>
						<dt className={styles.sumLabel}>Скидка</dt>
						<dd className={styles.sumValue}>
							−{formatPrice(totals.totalDiscount)}
						</dd>
					</div>
				) : null}

				<div className={styles.sumRow}>
					<dt className={styles.sumLabel}>Доставка</dt>
					<dd className={styles.sumTextValue}>
						{DELIVERY_OPTIONS[delivery.method].costShort}
					</dd>
				</div>

				<div className={styles.sumTotal}>
					<dt className={styles.sumTotalLabel}>К оплате</dt>
					{/* key по самой сумме — единственный способ проиграть анимацию
					    ЗАНОВО при каждом изменении итога: CSS-анимация запускается
					    один раз на элемент, и без пересоздания узла второе изменение
					    прошло бы молча. Во время пересчёта анимация выключена: пока
					    сумма заведомо устаревшая, подсвечивать в ней нечего. */}
					<dd
						key={totals.total}
						className={`${styles.sumTotalValue} ${isStale ? styles.sumStale : ""}`}
						data-changed={!isStale || undefined}
					>
						{formatPrice(totals.total)}
					</dd>
				</div>
			</dl>

			{totals.centralDiscountSuppressed && (
				// Молча заменить действующую акцию нельзя: покупатель видел её в
				// корзине и обязан понимать, почему её больше нет в расчёте.
				<p className={styles.sumNote}>
					<ShieldCheck size={13} aria-hidden />
					Промокод выгоднее действующей акции и заменил её
				</p>
			)}

			{delivery.method !== "self_pickup" && (
				<p className={styles.sumNote}>
					<Truck size={13} aria-hidden />
					{DELIVERY_OPTIONS[delivery.method].costNote} и выставит счёт отдельно
					от этого заказа
				</p>
			)}

			{/* ── Сверка ───────────────────────────────────────────────────── */}
			<dl className={styles.review}>
				<ReviewRow
					icon={<UserRound size={14} aria-hidden />}
					label="Получатель"
					value={contacts.fullName.trim()}
					empty="ФИО не указано"
				/>
				<ReviewRow
					icon={<PhoneCall size={14} aria-hidden />}
					label="Звонок по заказу"
					value={
						contactPhone
							? `${contactPhone} — ${callsRecipient ? "получателю" : "вам"}`
							: ""
					}
					empty="телефон не указан"
				/>
				<ReviewRow
					icon={
						delivery.method === "self_pickup" ? (
							<MapPin size={14} aria-hidden />
						) : (
							<Truck size={14} aria-hidden />
						)
					}
					label="Получение"
					value={deliveryLines.join(" · ")}
					empty={`${DELIVERY_METHOD_LABELS[delivery.method]} — не хватает данных`}
				/>
				<ReviewRow
					icon={<CreditCard size={14} aria-hidden />}
					label="Оплата"
					value={PAYMENT_METHOD_LABELS[paymentMethod]}
				/>
				{company.isCompany && (
					<ReviewRow
						icon={<Building2 size={14} aria-hidden />}
						label="Плательщик"
						value={[
							company.companyName,
							company.taxNumber && `ИНН ${company.taxNumber}`,
						]
							.filter(Boolean)
							.join(" · ")}
						empty="реквизиты не заполнены"
					/>
				)}
			</dl>

			{cartIssue && (
				<p role="status" className={`${styles.notice} ${styles.noticeWarn}`}>
					<AlertTriangle size={15} aria-hidden className={styles.noticeIcon} />
					<span>{cartIssue}</span>
				</p>
			)}

			<CheckoutErrorSummary
				entries={errorEntries}
				focusOnAppear={summaryFocusToken > 0}
				key={summaryFocusToken}
			/>

			{formError && (
				<p role="alert" className={`${styles.notice} ${styles.noticeError}`}>
					<AlertTriangle size={15} aria-hidden className={styles.noticeIcon} />
					<span>{formError}</span>
				</p>
			)}

			<button
				type="button"
				className={styles.cta}
				// Кнопка НЕ блокируется при невалидной форме: заблокированная
				// кнопка не объясняет, чего не хватает, и пользователь остаётся без
				// обратной связи. Вместо этого нажатие показывает список ошибок и
				// уводит к первому полю.
				disabled={isSubmitting}
				aria-busy={isSubmitting || undefined}
				onClick={onSubmit}
			>
				{isSubmitting && (
					<Loader2 size={16} aria-hidden className={styles.spin} />
				)}
				Подтвердить заказ
			</button>

			{/* Состояние отправки — отдельной живой областью, а не подменой
			    подписи на кнопке: имя кнопки должно называть действие, а не
			    рассказывать, что происходит. */}
			<p role="status" className={styles.ctaNote}>
				{isSubmitting ? (
					"Создаём заказ — не закрывайте страницу"
				) : (
					<>
						Нажимая кнопку, вы соглашаетесь с{" "}
						<Link href="/consents" className={styles.ctaLink}>
							условиями оферты
						</Link>
						. Деньги не списываются — менеджер свяжется с вами для
						подтверждения.
					</>
				)}
			</p>
		</div>
	);
}

interface ReviewRowProps {
	icon: ReactNode;
	label: string;
	value: string;
	/** Текст на месте незаполненного значения. Без него строка не показывается. */
	empty?: string;
}

function ReviewRow({ icon, label, value, empty }: ReviewRowProps) {
	if (!value && !empty) return null;

	return (
		// dt и dd — прямые потомки div внутри dl: так требует спецификация, и
		// только так связь «подпись → значение» видит скринридер. Лишняя
		// обёртка между ними эту связь разрывает.
		<div className={styles.reviewRow}>
			<dt className={styles.reviewLabel}>
				<span className={styles.reviewIcon} aria-hidden>
					{icon}
				</span>
				<span className={styles.reviewLabelText}>{label}</span>
			</dt>
			<dd
				className={`${styles.reviewValue} ${value ? "" : styles.reviewEmpty}`}
			>
				{value || empty}
			</dd>
		</div>
	);
}
