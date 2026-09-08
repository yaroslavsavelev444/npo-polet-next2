import { z } from "zod";

/**
 * Форма обратной связи на странице контактов.
 *
 * Набор полей намеренно минимальный — имя, адрес, сообщение. Каждое лишнее
 * поле в форме первого контакта стоит отправленных сообщений: «должность»,
 * «компания», «бюджет» и «откуда узнали» здесь спрашивать нечего, всё это
 * выясняется в ответном письме, если вообще понадобится.
 *
 * Границы длин держим здесь единым источником правды: те же значения стоят в
 * minLength/maxLength полей коллекции contact-requests, а форма показывает по
 * ним счётчик символов.
 */
export const CONTACT_REQUEST_LIMITS = {
	name: { min: 2, max: 80 },
	message: { min: 10, max: 4000 },
} as const;

/**
 * Slug соглашения на обработку персональных данных. Страница существует и
 * наполняется через коллекцию `consents` — отдельной страницы согласия под
 * форму заводить не нужно.
 */
export const PERSONAL_DATA_CONSENT_SLUG = "personal-data";
export const PERSONAL_DATA_CONSENT_HREF = `/consents/${PERSONAL_DATA_CONSENT_SLUG}`;

export const contactRequestSchema = z.object({
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

	email: z
		.string()
		.trim()
		.min(1, "Укажите email — на него придёт ответ")
		.email("Похоже на опечатку в адресе"),

	message: z
		.string()
		.trim()
		.min(
			CONTACT_REQUEST_LIMITS.message.min,
			`Расскажите чуть подробнее — минимум ${CONTACT_REQUEST_LIMITS.message.min} символов`,
		)
		.max(
			CONTACT_REQUEST_LIMITS.message.max,
			`Максимум ${CONTACT_REQUEST_LIMITS.message.max} символов`,
		),

	/**
	 * Согласие на обработку персональных данных.
	 *
	 * `z.literal(true)` вместо `z.boolean()`: булево поле пропустило бы false,
	 * и форма ушла бы на сервер без согласия. Здесь схема сама делает галочку
	 * обязательной — и на клиенте, и в серверной проверке, которая использует
	 * ту же схему.
	 */
	consent: z.literal(true, {
		error: "Без согласия на обработку данных отправить сообщение нельзя",
	}),
});

export type ContactRequestFormData = z.infer<typeof contactRequestSchema>;
