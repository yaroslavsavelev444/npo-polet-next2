/**
 * Реестр полей формы оформления заказа.
 *
 * Ошибки валидации приходят из zod-схемы путями вида `delivery.address.city`.
 * Чтобы показать их в общем списке и увести пользователя к нужному контролу,
 * нужны три вещи, которых в схеме нет и быть не должно: человекочитаемое
 * название поля, раздел формы и id элемента в DOM. Реестр держит их в одном
 * месте — иначе они расползаются по компонентам и рассинхронизируются с
 * путями схемы при первом же переименовании.
 */

export const CHECKOUT_SECTIONS = {
	delivery: "Способ получения",
	recipient: "Данные получателя",
	company: "Организация",
	payment: "Способ оплаты",
	cart: "Корзина",
} as const;

export type CheckoutSectionKey = keyof typeof CHECKOUT_SECTIONS;

export interface CheckoutFieldMeta {
	/** Название поля в списке ошибок. */
	label: string;
	section: CheckoutSectionKey;
	/**
	 * id элемента, на который ведёт ссылка из общего списка ошибок.
	 * Для адреса подставляется динамически (см. resolveFieldTarget): в режиме
	 * подсказок все компоненты адреса живут в одном поле поиска.
	 */
	elementId: string;
}

/** Единый префикс id — исключает совпадения с чужими элементами страницы. */
const ID = "checkout";

export const CHECKOUT_FIELD_IDS = {
	recipientFullName: `${ID}-recipient-full-name`,
	recipientPhone: `${ID}-recipient-phone`,
	recipientEmail: `${ID}-recipient-email`,
	transportCompany: `${ID}-transport-company`,
	pickupPoint: `${ID}-pickup-point`,
	addressQuery: `${ID}-address-query`,
	addressCity: `${ID}-address-city`,
	addressStreet: `${ID}-address-street`,
	addressHouse: `${ID}-address-house`,
	addressPostalCode: `${ID}-address-postal-code`,
	companyExisting: `${ID}-company-existing`,
	companyName: `${ID}-company-name`,
	companyLegalAddress: `${ID}-company-legal-address`,
	companyTaxNumber: `${ID}-company-tax-number`,
	payment: `${ID}-payment`,
} as const;

/**
 * Порядок = порядок разделов на странице. Общий список ошибок обязан идти
 * сверху вниз, иначе «перейти к полю» бросает пользователя назад по форме.
 */
export const CHECKOUT_FIELD_ORDER = [
	"delivery.transportCompanyId",
	"delivery.address.city",
	"delivery.address.street",
	"delivery.address.house",
	"delivery.address.postalCode",
	"delivery.pickupPointId",
	"recipient.fullName",
	"recipient.phone",
	"recipient.email",
	"company.existingCompanyId",
	"company.companyName",
	"company.legalAddress",
	"company.taxNumber",
	"paymentMethod",
] as const;

export const CHECKOUT_FIELDS: Record<string, CheckoutFieldMeta> = {
	"recipient.fullName": {
		label: "ФИО получателя",
		section: "recipient",
		elementId: CHECKOUT_FIELD_IDS.recipientFullName,
	},
	"recipient.phone": {
		label: "Телефон",
		section: "recipient",
		elementId: CHECKOUT_FIELD_IDS.recipientPhone,
	},
	"recipient.email": {
		label: "Email",
		section: "recipient",
		elementId: CHECKOUT_FIELD_IDS.recipientEmail,
	},
	"delivery.transportCompanyId": {
		label: "Транспортная компания",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.transportCompany,
	},
	"delivery.pickupPointId": {
		label: "Пункт самовывоза",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.pickupPoint,
	},
	"delivery.address.city": {
		label: "Город",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.addressCity,
	},
	"delivery.address.street": {
		label: "Улица",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.addressStreet,
	},
	"delivery.address.house": {
		label: "Дом",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.addressHouse,
	},
	"delivery.address.postalCode": {
		label: "Индекс",
		section: "delivery",
		elementId: CHECKOUT_FIELD_IDS.addressPostalCode,
	},
	"company.existingCompanyId": {
		label: "Организация",
		section: "company",
		elementId: CHECKOUT_FIELD_IDS.companyExisting,
	},
	"company.companyName": {
		label: "Название компании",
		section: "company",
		elementId: CHECKOUT_FIELD_IDS.companyName,
	},
	"company.legalAddress": {
		label: "Юридический адрес",
		section: "company",
		elementId: CHECKOUT_FIELD_IDS.companyLegalAddress,
	},
	"company.taxNumber": {
		label: "ИНН",
		section: "company",
		elementId: CHECKOUT_FIELD_IDS.companyTaxNumber,
	},
	paymentMethod: {
		label: "Способ оплаты",
		section: "payment",
		elementId: CHECKOUT_FIELD_IDS.payment,
	},
};

export const ADDRESS_FIELD_PATHS = [
	"delivery.address.city",
	"delivery.address.street",
	"delivery.address.house",
	"delivery.address.postalCode",
] as const;

export function isAddressFieldPath(path: string): boolean {
	return path.startsWith("delivery.address.");
}

export interface CheckoutErrorEntry {
	path: string;
	message: string;
	label: string;
	section: CheckoutSectionKey;
	sectionLabel: string;
	/** id элемента, к которому ведёт ссылка. */
	elementId: string;
}

/**
 * Собирает список ошибок для общего блока: в порядке разделов формы,
 * с человекочитаемыми названиями и целями для перехода.
 *
 * `addressManualMode` управляет тем, куда ведут ошибки адреса. В режиме
 * подсказок отдельных полей города/улицы/дома на странице нет — все ошибки
 * адреса схлопываются в одну запись, указывающую на поле поиска. Иначе
 * ссылка вела бы на несуществующий элемент, а пользователь видел бы четыре
 * строки об одном и том же поле.
 */
export function buildErrorEntries(
	errors: Record<string, string>,
	options: { addressManualMode: boolean } = { addressManualMode: false },
): CheckoutErrorEntry[] {
	const entries: CheckoutErrorEntry[] = [];
	const seen = new Set<string>();

	const push = (
		path: string,
		message: string,
		override?: Partial<CheckoutFieldMeta>,
	) => {
		const meta = CHECKOUT_FIELDS[path];
		if (!meta) return;
		entries.push({
			path,
			message,
			label: override?.label ?? meta.label,
			section: meta.section,
			sectionLabel: CHECKOUT_SECTIONS[meta.section],
			elementId: override?.elementId ?? meta.elementId,
		});
	};

	for (const path of CHECKOUT_FIELD_ORDER) {
		const message = errors[path];
		if (!message) continue;

		if (isAddressFieldPath(path) && !options.addressManualMode) {
			if (seen.has("address")) continue;
			seen.add("address");
			push(path, summarizeAddressErrors(errors), {
				label: "Адрес",
				elementId: CHECKOUT_FIELD_IDS.addressQuery,
			});
			continue;
		}

		push(path, message);
	}

	// Пути, которых нет в CHECKOUT_FIELD_ORDER (например, новые серверные
	// коды), не должны исчезать бесследно — показываем их в конце как есть.
	for (const [path, message] of Object.entries(errors)) {
		if ((CHECKOUT_FIELD_ORDER as readonly string[]).includes(path)) continue;
		entries.push({
			path,
			message,
			label: CHECKOUT_FIELDS[path]?.label ?? "Форма",
			section: CHECKOUT_FIELDS[path]?.section ?? "cart",
			sectionLabel: CHECKOUT_SECTIONS[CHECKOUT_FIELDS[path]?.section ?? "cart"],
			elementId: CHECKOUT_FIELDS[path]?.elementId ?? "",
		});
	}

	return entries;
}

/**
 * Одно сообщение вместо набора ошибок по компонентам адреса. Нужно там, где
 * пользователь видит адрес одним полем: перечислять «Укажите город», «Укажите
 * улицу», «Укажите номер дома» под единственным инпутом бессмысленно.
 */
export function summarizeAddressErrors(errors: Record<string, string>): string {
	const missing: string[] = [];
	if (errors["delivery.address.city"]) missing.push("населённый пункт");
	if (errors["delivery.address.street"]) missing.push("улицу");
	if (errors["delivery.address.house"]) missing.push("дом");

	const hasPostalCodeError = Boolean(errors["delivery.address.postalCode"]);

	if (missing.length > 0 && hasPostalCodeError) {
		return `Выберите адрес до дома: не хватает ${missing.join(", ")}. Индекс определится автоматически`;
	}
	if (missing.length > 0) {
		return `Выберите адрес до дома: не хватает ${missing.join(", ")}`;
	}
	if (hasPostalCodeError) {
		return "Не определился индекс — уточните адрес или введите индекс вручную";
	}
	return "Уточните адрес доставки";
}

/** Первое поле с ошибкой — цель для фокуса после неудачной отправки. */
export function findFirstErrorTarget(
	entries: CheckoutErrorEntry[],
): string | null {
	return entries.find((entry) => entry.elementId)?.elementId ?? null;
}
