import { z } from "zod";
import { isValidRuPhone } from "../../checkout/lib/phone.ts";
import { CONTACT_REQUEST_LIMITS } from "./contact-request.schema.ts";

/**
 * Заявка на товар, который сейчас нельзя купить.
 *
 * Минимум, с которым менеджер может перезвонить и предметно поговорить: кто,
 * по какому номеру и сколько штук нужно. Email не спрашиваем — разговор о
 * товаре, которого нет на складе, идёт голосом; комментарий — по желанию.
 *
 * Та же схема проверяется на клиенте и повторно на сервере.
 */
export const PRODUCT_REQUEST_LIMITS = {
	quantity: { min: 1, max: 100_000 },
	comment: { max: 1000 },
} as const;

export const productRequestSchema = z.object({
	productId: z.string().regex(/^\d+$/, "Товар не найден"),

	name: z
		.string()
		.trim()
		.min(
			CONTACT_REQUEST_LIMITS.name.min,
			`Минимум ${CONTACT_REQUEST_LIMITS.name.min} символа`,
		)
		.max(
			CONTACT_REQUEST_LIMITS.name.max,
			`Максимум ${CONTACT_REQUEST_LIMITS.name.max} символов`,
		),

	/** Маска «+7 (XXX) XXX-XX-XX» — та же, что на оформлении заказа. */
	phone: z
		.string()
		.trim()
		.min(1, "Укажите телефон — по нему перезвонит менеджер")
		.refine(isValidRuPhone, "Номер должен содержать 10 цифр после +7"),

	quantity: z.coerce
		.number({ error: "Укажите количество" })
		.int("Количество — целое число")
		.min(PRODUCT_REQUEST_LIMITS.quantity.min, "Минимум 1 шт.")
		.max(
			PRODUCT_REQUEST_LIMITS.quantity.max,
			"Для такой партии свяжитесь с нами напрямую",
		),

	comment: z
		.string()
		.trim()
		.max(
			PRODUCT_REQUEST_LIMITS.comment.max,
			`Максимум ${PRODUCT_REQUEST_LIMITS.comment.max} символов`,
		)
		.optional(),

	/** См. contactRequestSchema: literal(true) делает согласие обязательным. */
	consent: z.literal(true, {
		error: "Без согласия на обработку данных отправить заявку нельзя",
	}),
});

export type ProductRequestFormInput = z.input<typeof productRequestSchema>;
export type ProductRequestFormData = z.output<typeof productRequestSchema>;
