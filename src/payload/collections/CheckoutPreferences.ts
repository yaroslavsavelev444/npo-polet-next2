import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { DeliveryMethod } from "./Orders.ts";

export const CheckoutPreferences: CollectionConfig = {
	slug: "checkout-preferences",

	admin: {
		useAsTitle: "user",
		group: "Магазин",
		description:
			"Сохранённые получатель/адрес для автозаполнения оформления заказа",
	},

	access: {
		// Владелец — только своё, персонал — всё. См. ownership.ts.
		read: ownedByUserOrStaff,
		// Создание закрыто для покупателей: поле-владелец `user` не имеет
		// field-level access, поэтому `isLoggedIn` позволял любому вошедшему
		// создать документ, записав в `user` ЧУЖОЙ id (mass assignment), а заодно
		// плодить документы без ограничений. Легитимный путь — сервисы
		// (payload.create с overrideAccess: true), которые подставляют владельца
		// из проверенной сессии; персоналу создание из админки оставлено.
		create: isAdminOrSuperAdmin,
		// Раньше здесь было `!!req.user` — любой авторизованный покупатель мог
		// переписать чужие сохранённые данные получателя (ФИО, телефон, email,
		// адрес доставки) по прямому id, без всякого повышения привилегий.
		update: ownedByUserOrStaff,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			unique: true,
			index: true,
		},

		{
			name: "recipient",
			type: "group",
			label: "Сохранённый получатель",
			fields: [
				{ name: "fullName", type: "text" },
				{ name: "phone", type: "text" },
				{ name: "email", type: "email" },
			],
		},

		{
			name: "delivery",
			type: "group",
			label: "Сохранённая доставка",
			fields: [
				{
					name: "method",
					type: "select",
					options: [
						{ label: "Курьер до двери", value: DeliveryMethod.DOOR_TO_DOOR },
						{ label: "Доставка в ПВЗ", value: DeliveryMethod.PICKUP_POINT },
						{ label: "Самовывоз", value: DeliveryMethod.SELF_PICKUP },
					],
				},
				{
					name: "address",
					// Набор полей намеренно повторяет delivery.address в Orders: это
					// черновик будущего заказа, и любое расхождение означало бы, что
					// сохранённый адрес нельзя подставить в форму без потерь.
					type: "group",
					fields: [
						{ name: "fullAddress", type: "text", label: "Адрес одной строкой" },
						{ name: "postalCode", type: "text" },
						{ name: "country", type: "text" },
						{ name: "region", type: "text" },
						{ name: "area", type: "text" },
						{ name: "city", type: "text" },
						{ name: "settlement", type: "text" },
						{ name: "street", type: "text" },
						{ name: "house", type: "text", label: "Дом" },
						{ name: "block", type: "text", label: "Корпус / строение" },
						{ name: "apartment", type: "text", label: "Квартира / офис" },
						{ name: "entrance", type: "text", label: "Подъезд" },
						{ name: "floor", type: "text", label: "Этаж" },
						{ name: "fiasId", type: "text" },
						{ name: "fiasLevel", type: "text" },
						{ name: "kladrId", type: "text" },
						{ name: "geoLat", type: "text" },
						{ name: "geoLon", type: "text" },
						{ name: "qcGeo", type: "text" },
						{
							name: "source",
							type: "select",
							options: [
								{ label: "Подсказки (DaData)", value: "dadata" },
								{ label: "Ручной ввод", value: "manual" },
							],
						},
					],
				},
				{
					name: "transportCompany",
					type: "relationship",
					relationTo: "transport-companies",
				},
				{
					name: "pickupPoint",
					type: "relationship",
					relationTo: "pickup-points",
				},
			],
		},
	],
};
