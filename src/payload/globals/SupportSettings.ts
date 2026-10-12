import type { GlobalConfig } from "payload";
import { WEEKDAYS } from "../../modules/support-chat/lib/constants.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const validateTime = (value: string | null | undefined) =>
	value && TIME_PATTERN.test(value)
		? true
		: "Время в формате ЧЧ:ММ, например 09:00";

/**
 * Настройки чата с менеджером — всё, что меняется по обстановке без выкладки.
 *
 * Чтение закрыто для покупателей: витрина получает отсюда только производные
 * значения (открыто ли сейчас, ориентировочное время ответа) через сервер,
 * а не сами сроки эскалации и состав пилотной группы.
 *
 * Сервер читает глобал с коротким кэшем (см. support-chat/server/settings.ts),
 * поэтому изменение вступает в силу в пределах минуты без перезапуска.
 */
export const SupportSettings: GlobalConfig = {
	slug: "support-settings",
	label: "Чат поддержки",
	admin: {
		group: "Поддержка",
	},
	access: {
		read: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
	},
	fields: [
		{
			name: "enabled",
			type: "checkbox",
			label: "Чат включён для всех покупателей",
			defaultValue: false,
			admin: {
				description:
					"Рубильник. Выключен — писать могут только покупатели из пилотной " +
					"группы ниже; менеджеры подключаются к консоли всегда.",
			},
		},
		{
			name: "betaAllowlist",
			type: "relationship",
			relationTo: "users",
			hasMany: true,
			label: "Пилотная группа",
			admin: {
				description:
					"Покупатели, которым чат доступен, пока он выключен для всех.",
			},
		},
		{
			type: "collapsible",
			label: "Рабочее время",
			fields: [
				{
					name: "timezone",
					type: "text",
					required: true,
					defaultValue: "Europe/Moscow",
					label: "Часовой пояс",
					admin: {
						description: "Идентификатор IANA, например Europe/Moscow.",
					},
					validate: (value: string | null | undefined) => {
						if (!value) return "Укажите часовой пояс";
						try {
							new Intl.DateTimeFormat("ru-RU", { timeZone: value });
							return true;
						} catch {
							return "Неизвестный часовой пояс";
						}
					},
				},
				{
					name: "schedule",
					type: "array",
					label: "Расписание",
					labels: { singular: "Интервал", plural: "Интервалы" },
					// Будни — быстрые ответы, выходные — те же часы, но медленнее
					// (решение владельца, 11.10.2026). Новая установка получает это
					// расписание сразу; существующую заполняет миграция.
					defaultValue: [
						...(["mon", "tue", "wed", "thu", "fri"] as const).map((day) => ({
							day,
							opensAt: "09:00",
							closesAt: "18:00",
						})),
						...(["sat", "sun"] as const).map((day) => ({
							day,
							opensAt: "09:00",
							closesAt: "18:00",
							slaMinutes: 60,
						})),
					],
					admin: {
						description:
							"Дни без интервала — нерабочие. Интервал не может переходить " +
							"через полночь. «Срок ответа» интервала — для часов, когда " +
							"отвечаем медленнее (например, в выходные).",
					},
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "day",
									type: "select",
									required: true,
									label: "День",
									options: WEEKDAYS.map(({ value, label }) => ({
										value,
										label,
									})),
								},
								{
									name: "opensAt",
									type: "text",
									required: true,
									label: "С",
									defaultValue: "09:00",
									validate: validateTime,
								},
								{
									name: "closesAt",
									type: "text",
									required: true,
									label: "До",
									defaultValue: "18:00",
									validate: (
										value: string | null | undefined,
										{ siblingData }: { siblingData: { opensAt?: string } },
									) => {
										const format = validateTime(value);
										if (format !== true) return format;
										return value &&
											siblingData?.opensAt &&
											value > siblingData.opensAt
											? true
											: "Конец интервала должен быть позже начала";
									},
								},
								{
									name: "slaMinutes",
									type: "number",
									min: 1,
									max: 1440,
									label: "Срок ответа, мин",
									admin: {
										description: "Пусто — общий срок первого ответа.",
									},
								},
							],
						},
					],
				},
				{
					name: "holidays",
					type: "array",
					label: "Нерабочие дни",
					labels: { singular: "День", plural: "Дни" },
					fields: [
						{
							type: "row",
							fields: [
								{
									name: "date",
									type: "date",
									required: true,
									label: "Дата",
									admin: { date: { pickerAppearance: "dayOnly" } },
								},
								{ name: "note", type: "text", label: "Повод" },
							],
						},
					],
				},
			],
		},
		{
			type: "collapsible",
			label: "Тексты",
			fields: [
				{
					name: "texts",
					type: "group",
					label: false,
					fields: [
						{
							name: "greeting",
							type: "textarea",
							label: "Приветствие в пустом чате",
							defaultValue:
								"Здравствуйте! Напишите вопрос — менеджер ответит здесь же.",
						},
						{
							name: "offHoursReply",
							type: "textarea",
							label: "Автоответ в нерабочее время",
							defaultValue:
								"Сейчас нерабочее время. Мы получили ваше сообщение и ответим, " +
								"как только начнём работу.",
						},
					],
				},
			],
		},
		{
			type: "collapsible",
			label: "Распределение и сроки",
			fields: [
				{
					name: "routing",
					type: "group",
					label: false,
					fields: [
						{
							name: "mode",
							type: "select",
							required: true,
							defaultValue: "auto",
							label: "Распределение диалогов",
							options: [
								{
									label:
										"Автоматически — наименее загруженному менеджеру на месте",
									value: "auto",
								},
								{
									label: "Вручную — менеджеры сами берут из общей очереди",
									value: "manual",
								},
							],
						},
						{
							name: "firstResponseSlaMinutes",
							type: "number",
							required: true,
							defaultValue: 15,
							min: 1,
							max: 1440,
							label: "Срок первого ответа, мин",
						},
						{
							name: "reassignAfterMinutes",
							type: "number",
							required: true,
							defaultValue: 10,
							min: 1,
							max: 1440,
							label: "Вернуть в очередь, если назначенный молчит, мин",
						},
					],
				},
			],
		},
		{
			type: "collapsible",
			label: "Жизненный цикл",
			fields: [
				{
					name: "lifecycle",
					type: "group",
					label: false,
					fields: [
						{
							name: "reopenWindowDays",
							type: "number",
							required: true,
							defaultValue: 7,
							min: 0,
							max: 90,
							label: "Переоткрывать закрытый диалог в течение, дней",
							admin: {
								description:
									"Покупатель написал позже — начинается новый диалог.",
							},
						},
						{
							name: "autoCloseAfterDays",
							type: "number",
							required: true,
							defaultValue: 3,
							min: 1,
							max: 90,
							label: "Закрывать после ответа менеджера и тишины, дней",
						},
					],
				},
			],
		},
	],
};
