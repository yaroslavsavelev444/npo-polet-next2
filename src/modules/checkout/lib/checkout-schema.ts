import { z } from "zod";
import { RU_PHONE_E164_RE } from "./phone.ts";
import { validateFullName } from "./validate-full-name.ts";
import { validateInn } from "./validate-inn.ts";

/**
 * Единственный источник правды о валидности оформления заказа.
 *
 * Схема запускается ДВАЖДЫ и намеренно одной и той же:
 *  • на клиенте — чтобы показать ошибки у полей и в общем списке до отправки;
 *  • на сервере (submitOrderAction) — потому что клиенту доверять нельзя.
 * Любое расхождение между этими проверками означало бы форму, которая
 * «пропускает» заказ и получает отказ уже от сервера.
 */

// Все поля адреса опциональны на уровне базовой схемы — обязательность
// зависит от выбранного способа доставки и проверяется в superRefine ниже,
// иначе валидация адреса срабатывала бы даже для самовывоза.
//
// Схема принимает и «широкий» адрес (выбранный из подсказок, со всеми
// справочными полями), и минимальный ручной ввод: недостающие поля просто
// становятся пустыми строками.
const optionalText = (max = 200) => z.string().max(max).optional().default("");

const addressSchema = z.object({
	fullAddress: optionalText(500),
	postalCode: optionalText(20),
	country: z.string().max(100).optional().default("Россия"),
	region: optionalText(),
	area: optionalText(),
	city: optionalText(),
	settlement: optionalText(),
	street: optionalText(),
	house: optionalText(50),
	block: optionalText(50),
	// Данные, которых нет в адресных справочниках, — вводятся отдельно и
	// никогда не приходят из подсказок.
	apartment: optionalText(30),
	entrance: optionalText(10),
	floor: optionalText(10),
	// Справочные идентификаторы. Хранятся как есть; на валидность заказа не
	// влияют — адрес, введённый вручную, полноценен и без них.
	fiasId: optionalText(64),
	fiasLevel: optionalText(10),
	kladrId: optionalText(64),
	geoLat: optionalText(32),
	geoLon: optionalText(32),
	qcGeo: optionalText(10),
	source: z.enum(["dadata", "manual"]).optional().default("manual"),
});

/** Пути ошибок адреса, которые может вернуть схема. Используются в UI. */
export const ADDRESS_ERROR_FIELDS = [
	"city",
	"street",
	"house",
	"postalCode",
] as const;

export const checkoutSchema = z
	.object({
		recipient: z.object({
			// Строгая проверка ФИО (не логин/имя аккаунта) — в superRefine ниже,
			// чтобы вернуть точное сообщение об ошибке.
			fullName: z.string().trim(),
			phone: z
				.string()
				.regex(RU_PHONE_E164_RE, "Укажите корректный номер телефона"),
			email: z.string().email("Некорректный email"),
			saveRecipient: z.boolean(),
		}),
		delivery: z.object({
			method: z.enum(["door_to_door", "pickup_point", "self_pickup"]),
			address: addressSchema.optional(),
			transportCompanyId: z.string().optional(),
			pickupPointId: z.string().optional(),
			notes: z.string().max(1000).optional(),
			saveAddress: z.boolean(),
		}),
		company: z
			.object({
				isCompany: z.boolean(),
				existingCompanyId: z.string().optional(),
				companyName: z.string().optional(),
				legalAddress: z.string().optional(),
				companyAddress: z.string().optional(),
				taxNumber: z.string().optional(),
				contactPerson: z.string().optional(),
				saveCompany: z.boolean(),
			})
			.optional(),
		paymentMethod: z.enum(["invoice", "self_pickup_card", "self_pickup_cash"]),
		notes: z.string().max(1000).optional(),
	})
	.superRefine((data, ctx) => {
		// Строгая валидация ФИО получателя (фамилия + имя [+ отчество]).
		const fullNameError = validateFullName(data.recipient.fullName);
		if (fullNameError) {
			ctx.addIssue({
				code: "custom",
				path: ["recipient", "fullName"],
				message: fullNameError,
			});
		}

		const address = data.delivery.address;
		const city = address?.city?.trim() ?? "";
		const street = address?.street?.trim() ?? "";
		const settlement = address?.settlement?.trim() ?? "";
		const house = address?.house?.trim() ?? "";
		const postalCode = address?.postalCode?.trim() ?? "";

		// Delivery-method-specific requirements — только для выбранного способа,
		// остальные способы не проверяются вовсе (self_pickup не требует адреса).
		if (
			data.delivery.method === "door_to_door" ||
			data.delivery.method === "pickup_point"
		) {
			const isCourier = data.delivery.method === "door_to_door";

			// Населённый пункт: город ИЛИ посёлок/село. DaData для сельских
			// адресов оставляет `city` пустым и заполняет `settlement` — старая
			// проверка только по city отклоняла такие адреса целиком.
			if (city.length < 2 && settlement.length < 2) {
				ctx.addIssue({
					code: "custom",
					path: ["delivery", "address", "city"],
					message: isCourier
						? "Укажите город или населённый пункт"
						: "Укажите город назначения",
				});
			}
			if (street.length < 2) {
				ctx.addIssue({
					code: "custom",
					path: ["delivery", "address", "street"],
					message: "Укажите улицу",
				});
			}
			if (house.length < 1) {
				ctx.addIssue({
					code: "custom",
					path: ["delivery", "address", "house"],
					message: "Укажите номер дома",
				});
			}
			if (!data.delivery.transportCompanyId) {
				ctx.addIssue({
					code: "custom",
					path: ["delivery", "transportCompanyId"],
					message: "Выберите транспортную компанию",
				});
			}
			// Индекс нужен только курьеру — перевозчик рассчитывает по нему
			// тариф до двери. Для ПВЗ достаточно адреса пункта.
			if (isCourier && !/^\d{6}$/.test(postalCode)) {
				ctx.addIssue({
					code: "custom",
					path: ["delivery", "address", "postalCode"],
					message: "Индекс должен содержать 6 цифр",
				});
			}
		}

		if (
			data.delivery.method === "self_pickup" &&
			!data.delivery.pickupPointId
		) {
			ctx.addIssue({
				code: "custom",
				path: ["delivery", "pickupPointId"],
				message: "Выберите пункт самовывоза",
			});
		}

		// Payment/delivery compatibility (self_pickup_* only for self_pickup)
		const remoteOnlyInvoice = data.delivery.method !== "self_pickup";
		if (remoteOnlyInvoice && data.paymentMethod !== "invoice") {
			ctx.addIssue({
				code: "custom",
				path: ["paymentMethod"],
				message:
					"Для выбранного способа доставки доступна только оплата по счету",
			});
		}

		// Company requirements
		if (data.company?.isCompany) {
			if (data.company.existingCompanyId) return;
			if (!data.company.companyName?.trim()) {
				ctx.addIssue({
					code: "custom",
					path: ["company", "companyName"],
					message: "Укажите название компании",
				});
			}
			if (!data.company.legalAddress?.trim()) {
				ctx.addIssue({
					code: "custom",
					path: ["company", "legalAddress"],
					message: "Укажите юридический адрес",
				});
			}
			const innError = data.company.taxNumber
				? validateInn(data.company.taxNumber)
				: "Укажите ИНН";
			if (innError) {
				ctx.addIssue({
					code: "custom",
					path: ["company", "taxNumber"],
					message: innError,
				});
			}
		}
	});

export type CheckoutSchemaInput = z.infer<typeof checkoutSchema>;

/** Ошибки формы: путь поля (`delivery.address.city`) → текст. */
export type CheckoutFieldErrors = Record<string, string>;

/**
 * Приводит issues zod к плоской карте «путь → сообщение».
 *
 * Первое сообщение по пути выигрывает: zod может выдать на одно поле и
 * встроенную ошибку типа, и уточняющую из superRefine, а пользователю нужна
 * одна понятная формулировка.
 */
export function collectFieldErrors(
	issues: readonly { path: readonly PropertyKey[]; message: string }[],
): CheckoutFieldErrors {
	const errors: CheckoutFieldErrors = {};
	for (const issue of issues) {
		const path = issue.path.map(String).join(".");
		if (!path || path in errors) continue;
		errors[path] = issue.message;
	}
	return errors;
}

/**
 * Проверяет форму целиком и возвращает карту ошибок. Пустой объект —
 * форма валидна. Используется и клиентом, и сервером.
 */
export function validateCheckout(input: unknown): CheckoutFieldErrors {
	const parsed = checkoutSchema.safeParse(input);
	if (parsed.success) return {};
	return collectFieldErrors(parsed.error.issues);
}
