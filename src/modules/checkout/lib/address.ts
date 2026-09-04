/**
 * Доменная модель адреса доставки.
 *
 * Модель НЕ является отражением ответа DaData. DaData — всего лишь один из
 * источников заполнения (второй — ручной ввод), поэтому здесь описаны только
 * те поля, которые нужны бизнесу: собрать читаемый адрес, отдать его
 * перевозчику и однозначно сопоставить с ФИАС/КЛАДР при выгрузке.
 * Преобразование сырого ответа DaData в эту модель живёт в
 * `server/dadata-client.ts` и нигде больше — доменная модель не зависит от
 * формата внешнего API.
 *
 * Обратная совместимость: исторические заказы содержат только
 * city/street/house/apartment/postalCode/country (а самые старые — вообще
 * весь адрес одной строкой в `street`). Все новые поля опциональны, а
 * `formatAddress` умеет собирать читаемую строку из любого подмножества.
 */

/** Источник адресных данных. `manual` — пользователь вводил поля руками. */
export type AddressSource = "dadata" | "manual";

/**
 * Адрес в том виде, в котором он живёт в форме оформления заказа и в
 * коллекции orders. Все поля — строки (в форме нет `null`), пустая строка
 * означает «не заполнено».
 */
export interface CheckoutAddress {
	/**
	 * Каноническая строка адреса до дома. Для DaData — поле `value`
	 * («г Москва, ул Ленина, д 10»). Для ручного ввода собирается из
	 * компонентов. Это то, что показывается пользователю и печатается в
	 * документах: части адреса, которых нет в отдельных полях (район, АО,
	 * посёлок), не теряются.
	 */
	fullAddress: string;

	// ── Компоненты адреса (заполняет DaData либо пользователь вручную) ────
	postalCode: string;
	country: string;
	region: string;
	area: string;
	city: string;
	settlement: string;
	street: string;
	house: string;
	/** Корпус/строение — отдельная от дома сущность в ФИАС. */
	block: string;

	// ── Данные, которых в адресных справочниках нет ───────────────────────
	// DaData определяет адрес максимум до квартиры, но подъезда и этажа не
	// знает в принципе. Эти поля вводит пользователь и они НЕ участвуют в
	// подсказках — иначе выбор подсказки затирал бы уже введённые данные.
	apartment: string;
	entrance: string;
	floor: string;

	// ── Идентификаторы (пусто при ручном вводе) ───────────────────────────
	fiasId: string;
	/** Уровень детализации ФИАС: "7" — улица, "8" — дом, "9" — квартира. */
	fiasLevel: string;
	kladrId: string;
	geoLat: string;
	geoLon: string;
	/** Точность координат DaData: "0" — точно до дома, "5" — не определены. */
	qcGeo: string;

	source: AddressSource;
}

/** Пустой адрес — единая точка правды для начального состояния формы. */
export function createEmptyAddress(): CheckoutAddress {
	return {
		fullAddress: "",
		postalCode: "",
		country: "Россия",
		region: "",
		area: "",
		city: "",
		settlement: "",
		street: "",
		house: "",
		block: "",
		apartment: "",
		entrance: "",
		floor: "",
		fiasId: "",
		fiasLevel: "",
		kladrId: "",
		geoLat: "",
		geoLon: "",
		qcGeo: "",
		source: "manual",
	};
}

/** Приводит любое частично заполненное значение к полной модели. */
export function normalizeAddress(
	input: Partial<Record<keyof CheckoutAddress, unknown>> | null | undefined,
): CheckoutAddress {
	const empty = createEmptyAddress();
	if (!input) return empty;

	const str = (value: unknown, fallback = ""): string => {
		if (typeof value === "string") return value;
		if (typeof value === "number") return String(value);
		return fallback;
	};

	return {
		fullAddress: str(input.fullAddress),
		postalCode: str(input.postalCode),
		country: str(input.country, empty.country) || empty.country,
		region: str(input.region),
		area: str(input.area),
		city: str(input.city),
		settlement: str(input.settlement),
		street: str(input.street),
		house: str(input.house),
		block: str(input.block),
		apartment: str(input.apartment),
		entrance: str(input.entrance),
		floor: str(input.floor),
		fiasId: str(input.fiasId),
		fiasLevel: str(input.fiasLevel),
		kladrId: str(input.kladrId),
		geoLat: str(input.geoLat),
		geoLon: str(input.geoLon),
		qcGeo: str(input.qcGeo),
		source: input.source === "dadata" ? "dadata" : "manual",
	};
}

/** Части адреса, известные любому формату заказа — включая исторический. */
export interface AddressLike {
	fullAddress?: string | null;
	postalCode?: string | null;
	country?: string | null;
	region?: string | null;
	area?: string | null;
	city?: string | null;
	settlement?: string | null;
	street?: string | null;
	house?: string | null;
	block?: string | null;
	apartment?: string | null;
	entrance?: string | null;
	floor?: string | null;
}

function clean(value: string | null | undefined): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Собирает адрес до дома из компонентов. Используется, когда `fullAddress`
 * пуст: у исторических заказов и при ручном вводе.
 */
export function composeAddressLine(address: AddressLike): string {
	const houseSegment = [
		clean(address.house) ? `д. ${clean(address.house)}` : "",
		clean(address.block) ? `к. ${clean(address.block)}` : "",
	]
		.filter(Boolean)
		.join(" ");

	return [
		clean(address.postalCode),
		clean(address.region),
		clean(address.area),
		clean(address.city),
		clean(address.settlement),
		clean(address.street),
		houseSegment,
	]
		.filter(Boolean)
		.join(", ");
}

export interface FormatAddressOptions {
	/** Добавлять квартиру/подъезд/этаж (актуально только для курьера). */
	withUnitDetails?: boolean;
	/** Добавлять индекс, если он не попал в `fullAddress`. */
	withPostalCode?: boolean;
}

/**
 * Единая функция отображения адреса — используется и на витрине, и в письмах,
 * и в подтверждении заказа.
 *
 * Порядок источников намеренно такой:
 *  1. `fullAddress` (новые заказы, адрес выбран из подсказок) — он уже
 *     содержит район/АО/посёлок, которых нет в отдельных полях;
 *  2. сборка из компонентов (заказы после разбиения адреса на поля);
 *  3. `street` целиком (самые старые заказы, где весь адрес лежал в одном
 *     поле) — этот случай покрывается пунктом 2, т.к. street выводится как есть.
 *
 * Квартира/подъезд/этаж всегда добавляются отдельными сегментами и никогда
 * не смешиваются с адресной частью.
 */
export function formatAddress(
	address: AddressLike | null | undefined,
	options: FormatAddressOptions = {},
): string {
	if (!address) return "";

	const base = clean(address.fullAddress) || composeAddressLine(address);
	if (!base) return "";

	const segments: string[] = [];

	// Индекс мог не попасть в fullAddress (DaData отдаёт его отдельным полем,
	// а `value` начинается с региона) — дописываем его в начало.
	const postalCode = clean(address.postalCode);
	const needsPostalCode =
		options.withPostalCode !== false &&
		postalCode &&
		!base.includes(postalCode);
	segments.push(needsPostalCode ? `${postalCode}, ${base}` : base);

	if (options.withUnitDetails) {
		const apartment = clean(address.apartment);
		const entrance = clean(address.entrance);
		const floor = clean(address.floor);
		if (apartment) segments.push(`кв./офис ${apartment}`);
		if (entrance) segments.push(`подъезд ${entrance}`);
		if (floor) segments.push(`этаж ${floor}`);
	}

	return segments.join(", ");
}

/**
 * Адрес считается «до дома», если известен номер дома. Именно это, а не
 * fias_level, проверяется в валидации: ручной ввод корректен ровно так же,
 * как выбор из подсказок.
 */
export function hasHouseLevelPrecision(address: AddressLike): boolean {
	return clean(address.house).length > 0;
}
