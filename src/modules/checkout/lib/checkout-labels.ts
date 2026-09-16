import type { CheckoutDeliveryMethod, CheckoutPaymentMethod } from "../types";

/**
 * Подписи способов получения и оплаты — одним списком на всю форму.
 *
 * Раньше те же тексты жили в двух местах: в выборе способа и в итоговой
 * панели подтверждения. Назвать один и тот же способ по-разному в форме и в
 * итоге — верный способ заставить покупателя решать, точно ли он подтверждает
 * то, что выбрал, поэтому источник теперь один.
 */

export interface DeliveryOptionCopy {
	label: string;
	/** Одна фраза о том, что это за способ. */
	description: string;
	/**
	 * Что произойдёт со стоимостью доставки.
	 *
	 * Цифры здесь нет намеренно: доставку в этом магазине считает перевозчик
	 * по своему тарифу уже после оформления, и в заказ она записывается нулём
	 * (`pricing.shippingCost`). Показать вместо этого «0 ₽» значило бы пообещать
	 * бесплатную доставку, которой нет.
	 */
	costNote: string;
	/** Короткий вариант той же мысли — для строки «Доставка» в расчёте. */
	costShort: string;
}

export const DELIVERY_OPTIONS: Record<
	CheckoutDeliveryMethod,
	DeliveryOptionCopy
> = {
	door_to_door: {
		label: "Курьер до двери",
		description: "Транспортная компания привезёт заказ по адресу",
		costNote: "Стоимость доставки рассчитает транспортная компания",
		costShort: "по тарифу перевозчика",
	},
	pickup_point: {
		label: "Доставка в ПВЗ",
		description: "До пункта выдачи транспортной компании в вашем городе",
		costNote: "Стоимость доставки рассчитает транспортная компания",
		costShort: "по тарифу перевозчика",
	},
	self_pickup: {
		label: "Самовывоз",
		description: "Заберите заказ со склада сами",
		costNote: "Доставка не нужна — заказ вы забираете сами",
		costShort: "бесплатно",
	},
};

export const DELIVERY_METHOD_LABELS: Record<CheckoutDeliveryMethod, string> = {
	door_to_door: DELIVERY_OPTIONS.door_to_door.label,
	pickup_point: DELIVERY_OPTIONS.pickup_point.label,
	self_pickup: DELIVERY_OPTIONS.self_pickup.label,
};

export interface PaymentOptionCopy {
	label: string;
	/** Чем этот способ отличается от остальных. */
	description: string;
	/**
	 * Что произойдёт после нажатия «Подтвердить заказ». Обязательная часть:
	 * оплата ни по одному из способов не списывается в момент оформления, и
	 * покупатель должен знать это ДО нажатия, а не после.
	 */
	afterSubmit: string;
}

export const PAYMENT_OPTIONS: Record<CheckoutPaymentMethod, PaymentOptionCopy> =
	{
		invoice: {
			label: "Банковский перевод по счету",
			description: "Для организаций и ИП, оплата по реквизитам",
			afterSubmit:
				"Счёт с реквизитами будет прикреплён к заказу — оплатить можно после подтверждения менеджером",
		},
		self_pickup_card: {
			label: "Картой при самовывозе",
			description: "Оплата картой в пункте выдачи",
			afterSubmit: "Оплатите картой, когда приедете забирать заказ",
		},
		self_pickup_cash: {
			label: "Наличными при самовывозе",
			description: "Оплата наличными в пункте выдачи",
			afterSubmit: "Оплатите наличными, когда приедете забирать заказ",
		},
	};

export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
	invoice: "По счёту",
	self_pickup_card: PAYMENT_OPTIONS.self_pickup_card.label,
	self_pickup_cash: PAYMENT_OPTIONS.self_pickup_cash.label,
};

/** Склонение «позиция / позиции / позиций». */
export function pluralPositions(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "позиция";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "позиции";
	return "позиций";
}
