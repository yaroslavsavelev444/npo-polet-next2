import type {
	CollectionBeforeChangeHook,
	CollectionConfig,
	FieldHook,
} from "payload";
import type { Order } from "../../../payload-types.ts";
import {
	type OrderContactPreference,
	resolveOrderContact,
} from "../../modules/orders/lib/order-contact.ts";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { notifyNewOrder } from "../../services/notifications/notifyNewOrder.ts";
import {
	notifyOrderCancelled,
	notifyOrderStatusChanged,
} from "../../services/notifications/notifyOrderStatusChanged.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { revokeRedemptionsForOrder } from "../services/promo-redemptions.db.ts";

/** Заказы после удаления аккаунта обезличиваются (user становится пустым) — для них in-app уведомление создавать некому. */
function getOrderUserId(doc: { user?: unknown }): number | null {
	const { user } = doc;
	if (typeof user === "number") return user;
	if (user && typeof user === "object" && "id" in user) {
		return Number((user as { id: unknown }).id);
	}
	return null;
}

// ─── Enums ──────────────────────────────────────────────────────────────────

export const OrderStatus = {
	PENDING: "pending",
	CONFIRMED: "confirmed",
	PROCESSING: "processing",
	// PACKED и READY_FOR_PICKUP существовали в старой системе и добавлены сюда
	// конкретно для сохранения точности статусов при переносе исторических
	// заказов (scripts/db-migrate/migrations/orders.migration.ts) — не только
	// ради самой миграции, но и как значимые самостоятельные статусы.
	PACKED: "packed",
	SHIPPED: "shipped",
	READY_FOR_PICKUP: "ready_for_pickup",
	DELIVERED: "delivered",
	CANCELLED: "cancelled",
	REFUNDED: "refunded",
	AWAITING_INVOICE: "awaiting_invoice",
} as const;
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * door_to_door — courier delivery to a street address (requires TransportCompany + address)
 * pickup_point — delivery to a carrier's own PVZ network (requires TransportCompany + destination city)
 * self_pickup  — pickup from one of OUR PickupPoints (requires PickupPoint relation)
 *
 * Deliberately distinct from the old project's model, which conflated "carrier"
 * and "carrier's PVZ" under one bucket and had no representation of our own
 * pickup points at all.
 */
export const DeliveryMethod = {
	DOOR_TO_DOOR: "door_to_door",
	PICKUP_POINT: "pickup_point",
	SELF_PICKUP: "self_pickup",
} as const;
export type DeliveryMethodType =
	(typeof DeliveryMethod)[keyof typeof DeliveryMethod];

/**
 * Intentionally only 3 methods, matching the checkout module's requirements.
 * self_pickup_* are only valid when delivery.method === self_pickup — enforced
 * server-side in modules/checkout/lib/payment-compatibility.ts, not here, so
 * the collection schema stays a pure data contract.
 */
export const PaymentMethod = {
	INVOICE: "invoice",
	SELF_PICKUP_CARD: "self_pickup_card",
	SELF_PICKUP_CASH: "self_pickup_cash",
} as const;
export type PaymentMethodType =
	(typeof PaymentMethod)[keyof typeof PaymentMethod];

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Номер следующего заказа = (максимальный уже существующий номер за год) + 1.
 *
 * Раньше считалось количество заказов за год (`totalDocs + 1`). Это неверно
 * сразу по двум причинам, и обе становятся критичными после переноса
 * исторических заказов из старой системы (scripts/db-migrate):
 *
 * 1. Количество ≠ последний номер. Перенесённые заказы занимают номера
 *    ORD-{год}-000001…N, при этом их createdAt — момент миграции, то есть они
 *    попадали в счётчик текущего года. Любой пропуск или удаление в
 *    нумерации приводили к тому, что count+1 указывал на УЖЕ ЗАНЯТЫЙ номер —
 *    а orderNumber уникален, значит падало бы оформление заказа у живого
 *    покупателя.
 * 2. Фильтр по createdAt вообще не связан с номером: заказ, созданный в этом
 *    году, может нести номер прошлого года (перенесённый) — и наоборот.
 *
 * Берём максимум по самому полю orderNumber: нумерация с нулями до 6 знаков,
 * поэтому лексикографическая сортировка совпадает с числовой. parseInt
 * останавливается на первом не-цифре и потому корректно читает и номера с
 * суффиксом -L<legacyId>, который миграция даёт заказам, чей исходный номер
 * уже был занят (см. resolveFreeOrderNumber в orders.migration.ts).
 */
const generateOrderNumber = async ({ operation, data, req }: any) => {
	// Только при создании
	if (operation !== "create") return data;

	// Если номер уже есть и он не пустой — ничего не делаем (миграция
	// проставляет номер исторического заказа сама).
	if (data?.orderNumber && data.orderNumber !== "") {
		return data;
	}

	const year = new Date().getFullYear();
	const prefix = `ORD-${year}-`;

	const { docs } = await req.payload.find({
		collection: "orders",
		where: { orderNumber: { like: prefix } },
		sort: "-orderNumber",
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	const lastNumber: string | undefined = docs[0]?.orderNumber;
	const lastSequence = lastNumber?.startsWith(prefix)
		? Number.parseInt(lastNumber.slice(prefix.length), 10)
		: 0;

	const nextNumber = ((Number.isNaN(lastSequence) ? 0 : lastSequence) + 1)
		.toString()
		.padStart(6, "0");
	data.orderNumber = `${prefix}${nextNumber}`;

	return data;
};

/**
 * Держит «номер для связи» в согласии с остальными полями заказа.
 *
 * `contact.phone` — денормализация, и она существует ровно затем, чтобы
 * менеджер видел готовый ответ, а не выводил его из трёх полей. Значит,
 * рассинхронизация недопустима: номер пересчитывается на КАЖДОЕ изменение
 * заказа, а не только при оформлении. Иначе правка телефона заказчика в
 * админке оставила бы в поле связи прежний номер — то есть ровно ту ошибку,
 * ради которой поле и вводилось.
 *
 * Побочный полезный эффект — исторические заказы. У них группа `contact`
 * пуста; при первом же изменении (смена статуса, прикрепление счёта) хук
 * заполняет её единственным известным номером получателя. Отдельная миграция
 * данных для этого не нужна: до тех пор чтение делает ту же подстановку
 * (см. getOrderContact).
 */
/**
 * Значение поля с учётом частичного обновления.
 *
 * Различать «поля нет в запросе» и «поле пришло пустым» здесь обязательно, и
 * различает их наличие ключа, а не `??`. Со слиянием через `??` очистка
 * телефона в админке (поле пришло как null) молча возвращала бы прежний
 * номер — то есть заказ продолжал бы указывать на телефон, который менеджер
 * только что удалил.
 */
function fieldOrPrevious(
	incoming: Record<string, unknown> | null | undefined,
	previous: Record<string, unknown> | null | undefined,
	key: string,
): unknown {
	if (incoming && key in incoming) return incoming[key];
	return previous?.[key];
}

/**
 * Дозаполняет контакт при ЧТЕНИИ заказа, ничего не записывая.
 *
 * Нужно ровно для заказов, оформленных до разделения номеров: в базе у них
 * группа `contact` пуста, и админка показывала бы менеджеру пустое «Номер для
 * связи» рядом с заполненным телефоном получателя — то есть заставляла бы
 * его додумывать, куда звонить. Витрина покупателя и письма уже подставляют
 * этот номер через getOrderContact; хук распространяет ту же трактовку на
 * админку и REST API, оставляя данные в базе нетронутыми.
 *
 * Записывать сюда нечего: сохранение заказа в админке и без того приводит
 * контакт в согласованный вид (см. syncOrderContact).
 */
function resolveContactFieldOnRead(
	key: "phone" | "owner",
): FieldHook<Order, string | null | undefined> {
	return ({ value, data }) => {
		if (typeof value === "string" && value.trim() !== "") return value;

		const resolved = resolveOrderContact({
			customerPhone: data?.contact?.customerPhone,
			recipientPhone: data?.recipient?.phone,
			preferred: data?.contact?.preferred,
		});

		// Обезличенный заказ: номеров не осталось, резолвер возвращает пустое
		// значение — поле обязано остаться пустым, а не показывать выдуманное.
		return resolved[key] || value;
	};
}

const syncOrderContact: CollectionBeforeChangeHook = ({
	data,
	originalDoc,
	req,
}) => {
	if (!data) return data;

	// Перенос исторических заказов (scripts/db-migrate) не должен получать
	// придуманный выбор покупателя: у таких заказов он неизвестен, и записать
	// его значило бы сделать догадку неотличимой от настоящих данных. Читаются
	// они корректно и без этого — getOrderContact подставляет единственный
	// известный номер на лету.
	if (req?.context?.isMigration) return data;

	// На update Payload передаёт только изменённые поля — недостающие берём из
	// текущего документа, иначе частичное обновление (например, смена статуса)
	// обнулило бы контакт.
	const customerPhone = fieldOrPrevious(
		data.contact,
		originalDoc?.contact,
		"customerPhone",
	);
	const recipientPhone = fieldOrPrevious(
		data.recipient,
		originalDoc?.recipient,
		"phone",
	);
	const preferred = fieldOrPrevious(
		data.contact,
		originalDoc?.contact,
		"preferred",
	);

	const resolved = resolveOrderContact({
		customerPhone: typeof customerPhone === "string" ? customerPhone : null,
		recipientPhone: typeof recipientPhone === "string" ? recipientPhone : null,
		preferred: typeof preferred === "string" ? preferred : null,
	});

	data.contact = {
		...(data.contact ?? {}),
		customerPhone: resolved.customerPhone || undefined,
		// Ни одного номера не осталось (обезличенный заказ) — поле связи должно
		// быть пустым, а не указывать на несуществующий номер.
		preferred: (resolved.owner ?? undefined) as
			| OrderContactPreference
			| undefined,
		phone: resolved.phone || undefined,
	};

	return data;
};

// ─── Collection ─────────────────────────────────────────────────────────────

export const Orders: CollectionConfig = {
	slug: "orders",

	admin: {
		useAsTitle: "orderNumber",
		// Колонками списка Payload делает только поля верхнего уровня — группы
		// ("recipient", "pricing") он молча пропускает. Поэтому номер для связи
		// сюда не добавлен: заводить ради колонки отдельное дублирующее поле
		// значило бы завести второй источник правды о том, куда звонить.
		// Менеджер видит номер там, где действительно работает с заказом: первым
		// блоком в карточке заказа и в письме о новом заказе.
		defaultColumns: [
			"orderNumber",
			"status",
			"recipient",
			"pricing",
			"createdAt",
		],
		group: "Магазин",
	},

	access: {
		// Покупатель видит только свои заказы, персонал — все.
		// Проверка «свой/чужой» вынесена в ownedByUserOrStaff: раньше здесь
		// сравнивалась только req.user.role, без коллекции, и покупатель с
		// role=superadmin читал заказы всех пользователей (ФИО получателей,
		// телефоны, состав, суммы) через GET /api/orders.
		read: ownedByUserOrStaff,
		// Создание закрыто ПОЛНОСТЬЮ для любого клиента REST/GraphQL API.
		// Единственный легитимный путь — createOrderFromCheckout() (см.
		// orders.service.ts), который вызывает payload.create с
		// overrideAccess: true и потому этот гейт не проходит вовсе. Там же
		// цены и состав пересчитываются на сервере из корзины.
		//
		// Раньше здесь было `isLoggedIn` без единого field-level access на
		// pricing/user/payment/status/items — и любой вошедший покупатель мог
		// POST /api/orders с произвольной суммой (total: 1 ₽), payment.status:
		// "paid", чужим user и любым статусом, полностью минуя серверный
		// пересчёт цен в submitOrderAction. admin.readOnly на полях — лишь
		// подсказка UI и REST/GraphQL API не защищает.
		create: () => false,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeChange: [generateOrderNumber, syncOrderContact],
		afterChange: [
			/**
			 * Возврат активации промокода при отмене заказа.
			 *
			 * Живёт хуком коллекции, а не в Server Action отмены, сознательно:
			 * заказ отменяют из трёх разных мест — личный кабинет покупателя,
			 * админка и сервисные скрипты. Положи эту логику в один из путей —
			 * отмена из двух других тихо «съедала» бы активацию, и лимит акции
			 * таял бы без единого оформленного заказа.
			 *
			 * Возврат идемпотентен (см. revokeRedemptionsForOrder):
			 * повторные сохранения уже отменённого заказа ничего не меняют.
			 * Статус `refunded` обрабатывается наравне с `cancelled`: деньги
			 * покупателю вернули, значит и активация обязана вернуться в лимит.
			 */
			async ({ doc, previousDoc, operation, req }) => {
				if (req.context?.isMigration) return doc;
				if (operation !== "update") return doc;
				if (previousDoc?.status === doc.status) return doc;
				if (doc.status !== "cancelled" && doc.status !== "refunded") {
					return doc;
				}

				try {
					await revokeRedemptionsForOrder(
						req.payload,
						String(doc.id),
						doc.status === "refunded" ? "Возврат по заказу" : "Заказ отменён",
					);
				} catch (err) {
					// Отмена заказа важнее учёта активаций: уронив хук, мы
					// оставили бы покупателя с заказом, который «не отменяется».
					// Расхождение счётчика восстановимо по журналу активаций,
					// потерянная отмена — нет.
					req.payload.logger.error(
						{ err, orderId: doc.id },
						"[promo] не удалось вернуть активацию промокода",
					);
				}

				return doc;
			},
			async ({ doc, previousDoc, operation, req }) => {
				// scripts/db-migrate/migrations/orders.migration.ts переносит
				// исторические заказы пачками через create/update — без этого флага
				// каждый перенесённый заказ рассылал бы "новый заказ"/смену статуса
				// реальным получателям.
				if (req.context?.isMigration) return doc;

				const userId = getOrderUserId(doc);

				if (operation === "create") {
					void notifyNewOrder(doc, req.payload); // явная передача, без нового импорта getPayload
					if (userId) {
						void notify(req.payload, userId, "order_created", {
							orderNumber: doc.orderNumber,
							itemsCount: doc.items?.length ?? 0,
						});
					}
					return doc;
				}

				// update: реагируем только на реальную смену статуса
				if (previousDoc?.status === doc.status) return doc;

				if (doc.status === "cancelled") {
					// Инициатор: если запрос пришёл с ролью user (не admin/superadmin) —
					// значит отменил сам покупатель через свой Server Action (isLoggedIn
					// на update сейчас разрешён только admin, поэтому на практике
					// отмена клиентом должна идти через отдельный override-access вызов
					// из cancelOrderForUser с флагом в req.context).
					const initiatedBy: "customer" | "admin" =
						req.context?.initiatedByCustomer === true ? "customer" : "admin";
					void notifyOrderCancelled(doc, initiatedBy);
					if (userId) {
						void notify(req.payload, userId, "order_cancelled", {
							orderNumber: doc.orderNumber,
							initiatedBy,
						});
					}
					return doc;
				}

				void notifyOrderStatusChanged(doc);
				if (userId) {
					void notify(req.payload, userId, "order_status_changed", {
						orderNumber: doc.orderNumber,
						status: doc.status,
					});
				}
				return doc;
			},
		],
	},

	fields: [
		{
			name: "orderNumber",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				readOnly: true,
				position: "sidebar",
				description: "Генерируется автоматически",
			},
		},

		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			admin: {
				position: "sidebar",
				description: "Пусто у заказов, обезличенных после удаления аккаунта",
			},
		},

		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: OrderStatus.PENDING,
			index: true,
			options: [
				{ label: "Ожидает подтверждения", value: OrderStatus.PENDING },
				{ label: "Подтверждён", value: OrderStatus.CONFIRMED },
				{ label: "В обработке", value: OrderStatus.PROCESSING },
				{ label: "Упакован", value: OrderStatus.PACKED },
				{ label: "Отправлен", value: OrderStatus.SHIPPED },
				{ label: "Готов к выдаче", value: OrderStatus.READY_FOR_PICKUP },
				{ label: "Доставлен", value: OrderStatus.DELIVERED },
				{ label: "Отменён", value: OrderStatus.CANCELLED },
				{ label: "Возврат", value: OrderStatus.REFUNDED },
				{ label: "Ожидает счёта", value: OrderStatus.AWAITING_INVOICE },
			],
			admin: { position: "sidebar" },
		},

		// ── Связь по заказу ────────────────────────────────────────────────────
		// Первая группа формы заказа в админке: с неё начинается работа
		// менеджера, и она отвечает на единственный вопрос — куда звонить.
		{
			name: "contact",
			type: "group",
			label: "Связь по заказу",
			admin: {
				description:
					"Звонить нужно по номеру из поля «Номер для связи» — его выбрал сам покупатель при оформлении. Определять номер по остальным полям заказа не требуется",
			},
			fields: [
				{
					name: "phone",
					type: "text",
					label: "Номер для связи",
					index: true,
					hooks: { afterRead: [resolveContactFieldOnRead("phone")] },
					admin: {
						readOnly: true,
						description:
							"Заполняется автоматически из выбора покупателя. Чтобы изменить — исправьте телефон заказчика или получателя ниже",
					},
				},
				{
					name: "preferred",
					type: "select",
					label: "Чей это номер",
					options: [
						{ label: "Заказчик (оформил заказ)", value: "customer" },
						{ label: "Получатель", value: "recipient" },
					],
					hooks: { afterRead: [resolveContactFieldOnRead("owner")] },
					admin: {
						description:
							"У заказов, оформленных до разделения номеров, подставляется единственный известный номер — он принадлежит получателю",
					},
				},
				{
					name: "customerPhone",
					type: "text",
					label: "Телефон заказчика",
					admin: {
						description:
							"Номер человека, оформившего заказ. Пусто у заказов, оформленных до разделения номеров",
					},
				},
			],
		},

		// ── Получатель ─────────────────────────────────────────────────────────
		{
			name: "recipient",
			type: "group",
			label: "Получатель",
			fields: [
				{ name: "fullName", type: "text", required: true },
				// НЕ обязателен: получателем может быть сам заказчик (тогда
				// отдельного номера нет) либо другой человек, чей номер покупатель
				// знать не обязан. Обязательным поле было, пока оно же служило
				// номером для связи; теперь за связь отвечает contact.phone.
				// У всех исторических заказов номер заполнен — чтение не меняется.
				{
					name: "phone",
					type: "text",
					label: "Телефон получателя",
					admin: {
						description:
							"Указывается, только если заказ получает другой человек",
					},
				},
				{ name: "email", type: "email", required: true },
				{ name: "contactPerson", type: "text" },
			],
		},

		// ── Доставка ───────────────────────────────────────────────────────────
		{
			name: "delivery",
			type: "group",
			label: "Доставка",
			fields: [
				{
					name: "method",
					type: "select",
					required: true,
					defaultValue: DeliveryMethod.SELF_PICKUP,
					options: [
						{ label: "Курьер до двери", value: DeliveryMethod.DOOR_TO_DOOR },
						{
							label: "Доставка в ПВЗ транспортной компании",
							value: DeliveryMethod.PICKUP_POINT,
						},
						{ label: "Самовывоз", value: DeliveryMethod.SELF_PICKUP },
					],
				},
				{
					name: "address",
					type: "group",
					label: "Адрес",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.DOOR_TO_DOOR ||
							siblingData?.method === DeliveryMethod.PICKUP_POINT,
					},
					// ВСЕ поля адреса опциональны и остаются такими навсегда.
					// В коллекции сосуществуют три поколения адресов:
					//   1) исторические заказы из старой системы — весь адрес одной
					//      строкой в `street`;
					//   2) заказы после разбиения на поля — city/street/house/apartment;
					//   3) текущие — плюс `fullAddress` и справочные идентификаторы,
					//      если адрес выбран из подсказок.
					// Обязательное поле здесь сломало бы чтение и правку заказов
					// первых двух поколений в админке; требования к заполненности
					// живут в схеме оформления (modules/checkout/lib/checkout-schema),
					// где они зависят от способа доставки.
					fields: [
						{
							name: "fullAddress",
							type: "text",
							label: "Адрес одной строкой",
							admin: {
								description:
									"Канонический адрес до дома. У заказов до внедрения подсказок пуст — адрес собирается из полей ниже",
							},
						},
						{ name: "postalCode", type: "text", label: "Индекс" },
						{ name: "country", type: "text", defaultValue: "Россия" },
						{ name: "region", type: "text", label: "Регион" },
						{ name: "area", type: "text", label: "Район" },
						{ name: "city", type: "text", label: "Город" },
						{ name: "settlement", type: "text", label: "Населённый пункт" },
						{ name: "street", type: "text", label: "Улица" },
						// house/apartment добавлены позже — исторические заказы хранят
						// весь адрес в одном поле street, поэтому они опциональны, а код
						// отображения (lib/address.formatAddress) поддерживает
						// оба формата.
						{ name: "house", type: "text", label: "Дом" },
						{ name: "block", type: "text", label: "Корпус / строение" },

						// Данные, которых нет в адресных справочниках: их вводит
						// покупатель, и они нужны только курьерской доставке.
						{ name: "apartment", type: "text", label: "Квартира / офис" },
						{ name: "entrance", type: "text", label: "Подъезд" },
						{ name: "floor", type: "text", label: "Этаж" },

						// Справочные идентификаторы. Заполнены только у адресов,
						// выбранных из подсказок; для логистики это единственный
						// способ сопоставить адрес с ФИАС без повторного разбора.
						{
							name: "fiasId",
							type: "text",
							label: "ФИАС ID",
							admin: { readOnly: true },
						},
						{
							name: "fiasLevel",
							type: "text",
							label: "Уровень ФИАС",
							admin: { readOnly: true },
						},
						{
							name: "kladrId",
							type: "text",
							label: "КЛАДР ID",
							admin: { readOnly: true },
						},
						{
							name: "geoLat",
							type: "text",
							label: "Широта",
							admin: { readOnly: true },
						},
						{
							name: "geoLon",
							type: "text",
							label: "Долгота",
							admin: { readOnly: true },
						},
						{
							name: "qcGeo",
							type: "text",
							label: "Точность координат",
							admin: { readOnly: true },
						},
						{
							name: "source",
							type: "select",
							label: "Источник адреса",
							options: [
								{ label: "Подсказки (DaData)", value: "dadata" },
								{ label: "Ручной ввод", value: "manual" },
							],
							admin: {
								readOnly: true,
								description:
									"Пусто у заказов, оформленных до внедрения подсказок адреса",
							},
						},
					],
				},
				{
					name: "transportCompany",
					type: "relationship",
					relationTo: "transport-companies",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.DOOR_TO_DOOR ||
							siblingData?.method === DeliveryMethod.PICKUP_POINT,
					},
				},
				{
					name: "pickupPoint",
					type: "relationship",
					relationTo: "pickup-points",
					admin: {
						condition: (_, siblingData) =>
							siblingData?.method === DeliveryMethod.SELF_PICKUP,
					},
				},
				{ name: "trackingNumber", type: "text", admin: { readOnly: true } },
				{ name: "estimatedDelivery", type: "date" },
				{ name: "notes", type: "textarea", label: "Комментарий к доставке" },
			],
		},

		// ── Позиции заказа (снимок на момент оформления) ─────────────────────
		{
			name: "items",
			type: "array",
			label: "Позиции заказа",
			minRows: 1,
			fields: [
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
				},
				{
					name: "name",
					type: "text",
					required: true,
					label: "Название (снимок)",
				},
				{ name: "quantity", type: "number", required: true, min: 1 },
				{ name: "unitPrice", type: "number", required: true, min: 0 },
				{ name: "discount", type: "number", defaultValue: 0, min: 0 },
				{ name: "totalPrice", type: "number", required: true, min: 0 },
			],
		},

		// ── Ценообразование (снимок из CartView.summary) ─────────────────────
		{
			name: "pricing",
			type: "group",
			label: "Стоимость",
			fields: [
				{ name: "subtotal", type: "number", required: true, min: 0 },
				{ name: "productDiscounts", type: "number", defaultValue: 0, min: 0 },
				{
					name: "centralDiscountAmount",
					type: "number",
					defaultValue: 0,
					min: 0,
				},
				{
					name: "centralDiscountPercent",
					type: "number",
					defaultValue: 0,
					min: 0,
					max: 100,
				},
				{
					name: "promoDiscountAmount",
					type: "number",
					defaultValue: 0,
					min: 0,
					label: "Скидка по промокоду",
				},
				{
					name: "discount",
					type: "number",
					defaultValue: 0,
					min: 0,
					label: "Скидка (итого)",
				},
				{ name: "shippingCost", type: "number", defaultValue: 0, min: 0 },
				{ name: "total", type: "number", required: true, min: 0 },
				{
					name: "currency",
					type: "text",
					defaultValue: "RUB",
					admin: { position: "sidebar" },
				},
			],
		},

		// ── Оплата ─────────────────────────────────────────────────────────────
		{
			name: "payment",
			type: "group",
			label: "Оплата",
			fields: [
				{
					name: "method",
					type: "select",
					required: true,
					options: [
						{
							label: "Банковский перевод по счету",
							value: PaymentMethod.INVOICE,
						},
						{
							label: "Картой при самовывозе",
							value: PaymentMethod.SELF_PICKUP_CARD,
						},
						{
							label: "Наличными при самовывозе",
							value: PaymentMethod.SELF_PICKUP_CASH,
						},
					],
				},
				{
					name: "status",
					type: "select",
					defaultValue: "pending",
					index: true,
					options: [
						{ label: "Ожидает", value: "pending" },
						{ label: "Оплачен", value: "paid" },
						{ label: "Ошибка", value: "failed" },
						{ label: "Возврат", value: "refunded" },
					],
				},
				{ name: "transactionId", type: "text" },
				{ name: "paidAt", type: "date" },
				// Attached by admin after order is placed (e.g. invoice PDF for `invoice` method)
				{ name: "invoiceFile", type: "relationship", relationTo: "media" },
			],
		},

		// ── Применённые скидки (снимок из CartView.discounts.applied) ────────
		{
			name: "appliedDiscounts",
			type: "array",
			label: "Применённые скидки",
			fields: [
				{ name: "discountId", type: "relationship", relationTo: "discounts" },
				{ name: "name", type: "text" },
				{ name: "discountPercent", type: "number" },
				{ name: "discountAmount", type: "number" },
				{ name: "message", type: "text" },
			],
		},

		// ── Промокод (снимок на момент оформления) ───────────────────────────
		/**
		 * Заказ хранит КОПИЮ промокода, а не только связь с ним.
		 *
		 * Промокод — живая сущность: его переименуют под новую акцию, отключат
		 * или удалят. Связи одной было бы недостаточно, чтобы через полгода
		 * ответить, откуда в заказе взялась скидка, — а именно этот вопрос
		 * задают при разборе возвратов и сверке с бухгалтерией. Связь при этом
		 * тоже сохраняется: по ней собирается статистика по акции.
		 */
		{
			name: "promoCode",
			type: "group",
			label: "Промокод",
			admin: {
				condition: (data) => Boolean(data?.promoCode?.code),
			},
			fields: [
				{
					name: "promoCodeId",
					type: "relationship",
					relationTo: "promo-codes",
					label: "Промокод",
				},
				{ name: "code", type: "text", label: "Код (снимок)" },
				{
					name: "discountType",
					type: "select",
					label: "Тип скидки",
					options: [
						{ label: "Процент от суммы", value: "percentage" },
						{ label: "Фиксированная сумма", value: "fixed" },
					],
				},
				{ name: "discountPercent", type: "number", label: "Процент" },
				{
					name: "discountAmount",
					type: "number",
					min: 0,
					label: "Сумма скидки, ₽",
				},
			],
		},

		// ── Компания (юр. лицо) ───────────────────────────────────────────────
		{
			name: "companyInfo",
			type: "group",
			label: "Организация",
			admin: {
				condition: (data) =>
					Boolean(data?.companyInfo?.companyId || data?.companyInfo?.name),
			},
			fields: [
				{ name: "companyId", type: "relationship", relationTo: "companies" },
				{ name: "name", type: "text" },
				{ name: "legalAddress", type: "text" },
				{ name: "companyAddress", type: "text" },
				{ name: "taxNumber", type: "text" },
				{ name: "contactPerson", type: "text" },
			],
		},

		{ name: "notes", type: "textarea", label: "Примечания к заказу" },
		{
			name: "internalNotes",
			type: "textarea",
			label: "Внутренние заметки",
			admin: { condition: () => false },
		},

		{
			name: "statusHistory",
			type: "array",
			label: "История статусов",
			admin: { readOnly: true },
			fields: [
				{
					name: "status",
					type: "select",
					required: true,
					options: Object.values(OrderStatus).map((s) => ({
						label: s,
						value: s,
					})),
				},
				{
					name: "changedAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
				},
				{
					name: "changedBy",
					type: "relationship",
					relationTo: ["users", "admins"],
				},
				{ name: "comment", type: "text" },
			],
		},

		{
			name: "source",
			type: "select",
			defaultValue: "web",
			options: [
				{ label: "Сайт", value: "web" },
				{ label: "Мобильное", value: "mobile" },
				{ label: "Админ", value: "admin" },
			],
			admin: { position: "sidebar" },
		},
		{ name: "ipAddress", type: "text", admin: { readOnly: true } },
		{ name: "userAgent", type: "text", admin: { readOnly: true } },

		legacyIdField,
	],
};
