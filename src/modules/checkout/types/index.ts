import type { CartView } from "@/modules/cart";
import type { Company } from "@/payload-types";
import type { CheckoutAddress } from "../lib/address";

export type CheckoutDeliveryMethod =
	| "door_to_door"
	| "pickup_point"
	| "self_pickup";
export type CheckoutPaymentMethod =
	| "invoice"
	| "self_pickup_card"
	| "self_pickup_cash";

export interface TransportCompanyOption {
	id: string;
	name: string;
	phone: string | null;
}

export interface PickupPointOption {
	id: string;
	name: string;
	address: string;
	city: string | null;
	workingHours: string | null;
}

export interface SavedRecipient {
	fullName: string;
	email: string;
	/**
	 * Телефон заказчика. Пусто у предпочтений, сохранённых до разделения
	 * номеров: тогда сохранялся один номер, и чей он — заказчика или
	 * получателя — неизвестно. Подставлять его наугад значило бы вернуть
	 * ровно ту ошибку, ради которой номера и разделили.
	 */
	customerPhone: string;
	/** Телефон получателя, если в прошлый раз он был указан отдельно. */
	recipientPhone: string;
}

export interface SavedDelivery {
	method: CheckoutDeliveryMethod;
	address?: Partial<CheckoutAddress>;
	transportCompanyId?: string;
	pickupPointId?: string;
}

export interface CheckoutView {
	cart: CartView;
	savedRecipient: SavedRecipient | null;
	savedDelivery: SavedDelivery | null;
	companies: Company[];
	pickupPoints: PickupPointOption[];
	transportCompanies: TransportCompanyOption[];
	/**
	 * Настроены ли подсказки адресов. Приходит с сервера, чтобы форма сразу
	 * рисовалась в режиме ручного ввода, а не «мигала» автокомплитом, который
	 * заведомо не ответит.
	 */
	addressSuggestionsEnabled: boolean;
}

// ── Подсказки адресов (контракт /api/address/suggest) ────────────────────────
// Типы описаны здесь, а не в серверном клиенте DaData, чтобы клиентский код
// никогда не импортировал модуль, читающий API-ключ.

/** Подсказка адреса в доменном виде — без следов формата провайдера. */
export interface AddressSuggestion {
	/** Стабильный ключ для списка. */
	id: string;
	/** Основная строка подсказки. */
	label: string;
	/** Уточнение под основной строкой (регион/район). */
	hint: string;
	/** Адрес определён до дома — подсказку можно принять как финальный адрес. */
	isComplete: boolean;
	address: CheckoutAddress;
}

export type AddressSuggestDegradeReason =
	| "not_configured"
	| "unavailable"
	| "rate_limited"
	| "too_short";

export interface AddressSuggestResponse {
	suggestions: AddressSuggestion[];
	/** Подсказки недоступны — форма переходит в режим ручного ввода. */
	degraded?: AddressSuggestDegradeReason;
}

// ── Client form state / submission payload ──────────────────────────────────

/** Чей номер выбран для связи менеджера по заказу. */
export type CheckoutContactPreference = "customer" | "recipient";

/** Данные того, кто оформляет заказ. */
export interface CheckoutCustomerInput {
	/** Номер в каноническом виде (+7XXXXXXXXXX). */
	phone: string;
}

export interface CheckoutRecipientInput {
	fullName: string;
	/**
	 * Телефон получателя — только когда заказ получает другой человек.
	 * Пустая строка означает «отдельного номера нет», а не ошибку ввода.
	 */
	phone: string;
	email: string;
	saveRecipient: boolean;
}

/**
 * Состояние блока контактов в форме. Отличается от отправляемых данных двумя
 * вещами, которые существуют только в интерфейсе: телефоны хранятся с маской
 * (+7 (999) 123-45-67), а `hasSeparateRecipient` — это положение
 * переключателя «заказ получит другой человек», а не факт о заказе.
 */
export interface CheckoutContactsFormValue {
	customerPhone: string;
	fullName: string;
	email: string;
	recipientPhone: string;
	hasSeparateRecipient: boolean;
	callPreference: CheckoutContactPreference;
	saveRecipient: boolean;
}

export interface CheckoutDeliveryInput {
	method: CheckoutDeliveryMethod;
	address?: CheckoutAddress;
	transportCompanyId?: string;
	pickupPointId?: string;
	notes?: string;
	saveAddress: boolean;
}

export interface CheckoutCompanyInput {
	isCompany: boolean;
	existingCompanyId?: string;
	companyName?: string;
	legalAddress?: string;
	companyAddress?: string;
	taxNumber?: string;
	contactPerson?: string;
	saveCompany: boolean;
}

export interface CheckoutSubmitInput {
	customer: CheckoutCustomerInput;
	recipient: CheckoutRecipientInput;
	/** Явный выбор покупателя: по какому номеру звонить по заказу. */
	contactPreference: CheckoutContactPreference;
	delivery: CheckoutDeliveryInput;
	company?: CheckoutCompanyInput;
	paymentMethod: CheckoutPaymentMethod;
	notes?: string;
	/**
	 * Применённый промокод — только сам код, без суммы скидки.
	 *
	 * Сумму клиент не присылает и прислать не может: она пересчитывается на
	 * сервере из корзины и правил кода. Приняв её от клиента, магазин отдавал
	 * бы скидку любого размера всякому, кто умеет менять тело запроса.
	 */
	promoCode?: string;
}

export type CheckoutActionErrorCode =
	| "AUTH_REQUIRED"
	| "CART_EMPTY"
	| "CART_INVALID"
	| "VALIDATION_ERROR"
	/**
	 * Промокод перестал быть применимым между нажатием «Применить» и
	 * подтверждением заказа: истёк срок, кончился лимит, изменилась корзина.
	 * Отдельный код, а не VALIDATION_ERROR, потому что исправляется он не
	 * правкой формы, а снятием промокода — и сообщение должно вести именно
	 * туда.
	 */
	| "PROMO_INVALID"
	| "UNKNOWN";

export type CheckoutActionResult =
	| { success: true; data: { orderNumber: string } }
	| {
			success: false;
			error: CheckoutActionErrorCode;
			message: string;
			fieldErrors?: Record<string, string>;
	  };
