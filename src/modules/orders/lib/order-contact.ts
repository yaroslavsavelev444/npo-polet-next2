/**
 * Кто есть кто среди телефонов заказа.
 *
 * Задача, ради которой этот модуль существует: менеджер после оформления
 * звонит НЕ тому. Раньше в заказе был ровно один номер — `recipient.phone`, —
 * и он использовался и как телефон получателя, и как телефон для связи. Но
 * заказ примерно в 60% случаев оформляет не тот человек, который его
 * получает: в поле оказывался номер получателя, а звонить надо было
 * заказчику, который один и знает детали заказа.
 *
 * Поэтому в заказе теперь три независимых величины:
 *   • `contact.customerPhone`  — номер того, кто ОФОРМИЛ заказ;
 *   • `recipient.phone`        — номер того, кто ПОЛУЧАЕТ заказ (может
 *                                отсутствовать: получатель не всегда другой
 *                                человек и не всегда известен отдельно);
 *   • `contact.preferred`      — чей номер выбрал покупатель для связи.
 * Плюс денормализованный `contact.phone` — уже вычисленный ответ на вопрос
 * «куда звонить». Он хранится в заказе явно, чтобы менеджеру никогда не
 * приходилось выводить его из остальных полей.
 *
 * Функции ниже — единственное место, где эта логика описана. Ими пользуются
 * и запись (оформление заказа, хук коллекции), и чтение (страница заказа,
 * письма, админка), поэтому разойтись они не могут.
 *
 * Отдельная обязанность модуля — заказы, оформленные ДО появления этих полей.
 * Миграции данных нет и не будет: у исторического заказа `contact` пуст, и
 * единственный известный номер лежит в `recipient.phone`. Резолвер трактует
 * такой заказ однозначно — звонить по нему, помечая номер как принадлежащий
 * получателю. Никаких «телефон не указан» на старых заказах не появляется.
 */

export type OrderContactPreference = "customer" | "recipient";

/** Человекочитаемое «чей это номер» — для интерфейсов и писем. */
export const ORDER_CONTACT_OWNER_LABELS: Record<
	OrderContactPreference,
	string
> = {
	customer: "Заказчик",
	recipient: "Получатель",
};

export interface OrderContactSource {
	/** Телефон оформившего заказ. Пусто у заказов до внедрения поля. */
	customerPhone?: string | null;
	/** Телефон получателя. Пусто, когда отдельный получатель не указан. */
	recipientPhone?: string | null;
	/** Выбор покупателя. Пусто у заказов до внедрения поля. */
	preferred?: OrderContactPreference | string | null;
}

export interface ResolvedOrderContact {
	/**
	 * Номер, по которому нужно связываться по заказу.
	 * Пустая строка возможна только у обезличенных заказов (удаление аккаунта).
	 */
	phone: string;
	/** Чей это номер. `null` — когда в заказе нет ни одного номера. */
	owner: OrderContactPreference | null;
	customerPhone: string;
	recipientPhone: string;
	/** У получателя есть собственный номер, отличный от номера заказчика. */
	hasSeparateRecipientPhone: boolean;
}

function normalize(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function toPreference(value: unknown): OrderContactPreference | null {
	return value === "customer" || value === "recipient" ? value : null;
}

/**
 * Приводит любую комбинацию номеров к однозначному ответу «куда звонить».
 *
 * Инвариант, который здесь удерживается: выбранным никогда не может оказаться
 * номер, которого нет. Если покупатель выбрал получателя, а телефон получателя
 * не указан (устаревшая вкладка, правка заказа в админке, обход формы) —
 * выбор молча переносится на существующий номер, а не превращается в пустое
 * поле, которое менеджеру пришлось бы расследовать.
 */
export function resolveOrderContact(
	source: OrderContactSource,
): ResolvedOrderContact {
	const customerPhone = normalize(source.customerPhone);
	const recipientPhone = normalize(source.recipientPhone);

	// Явный выбор покупателя. Его нет у исторических заказов — там
	// единственный известный номер принадлежит получателю, и он же
	// использовался для связи, поэтому такая трактовка не выдумывает данных.
	const requested =
		toPreference(source.preferred) ??
		(customerPhone ? "customer" : "recipient");

	let owner: OrderContactPreference | null = requested;
	if (owner === "recipient" && !recipientPhone) {
		owner = customerPhone ? "customer" : null;
	} else if (owner === "customer" && !customerPhone) {
		owner = recipientPhone ? "recipient" : null;
	}

	const phone =
		owner === "recipient"
			? recipientPhone
			: owner === "customer"
				? customerPhone
				: "";

	return {
		phone,
		owner,
		customerPhone,
		recipientPhone,
		hasSeparateRecipientPhone:
			recipientPhone !== "" && recipientPhone !== customerPhone,
	};
}

/** Читает контакты прямо из документа заказа (в том числе исторического). */
export function getOrderContact(order: {
	recipient?: { phone?: string | null } | null;
	contact?: {
		customerPhone?: string | null;
		preferred?: string | null;
		phone?: string | null;
	} | null;
}): ResolvedOrderContact {
	const resolved = resolveOrderContact({
		customerPhone: order.contact?.customerPhone,
		recipientPhone: order.recipient?.phone,
		preferred: order.contact?.preferred,
	});

	// Сохранённый в заказе `contact.phone` — снимок на момент оформления и
	// приоритетнее пересчёта: если менеджер поправил номер заказчика, снимок
	// уже обновлён хуком коллекции, а расхождение здесь означало бы, что
	// покупателю и менеджеру показываются разные номера.
	const stored = normalize(order.contact?.phone);
	return stored ? { ...resolved, phone: stored } : resolved;
}
