// src/payload/globals/AlertingSettings.ts
import type { GlobalConfig } from "payload";
import { isSuperAdmin, isSuperAdminUser } from "../access/isSuperAdmin.ts";

/**
 * Какие серверные ошибки доходят до человека письмом — то, что настраивается
 * без выкладки (src/services/observability/README.md).
 *
 * Настраиваемо ровно то, что приходится менять по обстановке: порог уровня,
 * паузы, часовой лимит, предупреждения. Эти числа зависят от того, сколько
 * сейчас ошибок и сколько их человек готов читать, — код этого знать не может.
 *
 * Намеренно НЕ настраивается здесь:
 *
 *  • адрес получателя — переменная ERROR_ALERT_EMAIL. Поле в админке — это
 *    поле в базе, а адрес нужен именно тогда, когда до базы не достучаться;
 *  • состав письма и правила очистки сообщений — они правятся только кодом
 *    (safe-payload.ts, normalize.ts). Вынести их сюда значило бы дать
 *    возможность одним переключателем начать отправлять в почту
 *    персональные данные покупателей;
 *  • запись в журнал ошибок — она идёт всегда: выключаемый журнал бесполезен.
 *
 * Неправдоподобные значения (например, 0 писем в час) сервер поправляет до
 * допустимых границ при чтении — см. services/observability/settings.ts.
 */
export const AlertingSettings: GlobalConfig = {
	slug: "alerting-settings",
	label: "Оповещения об ошибках",
	admin: {
		group: "Система",
		description:
			"Журнал ошибок пишется всегда и этими настройками не управляется. " +
			"Здесь — только то, какие ошибки приходят письмом на адрес из " +
			"переменной ERROR_ALERT_EMAIL.",
		hidden: ({ user }) => !isSuperAdminUser(user),
	},
	access: {
		// Чтение тоже закрыто: пороги и паузы подсказывают, как долго сайт не
		// заметит проблему.
		read: isSuperAdmin,
		update: isSuperAdmin,
	},
	fields: [
		{
			name: "emailEnabled",
			type: "checkbox",
			label: "Присылать письма об ошибках",
			defaultValue: true,
			admin: {
				description:
					"Если переменная ERROR_ALERT_EMAIL пуста, письма не уходят " +
					"независимо от этого флага.",
			},
		},
		{
			name: "severityThreshold",
			type: "select",
			label: "Минимальный уровень",
			defaultValue: "error",
			options: [
				{ label: "Только падения процессов", value: "fatal" },
				{ label: "Ошибки и падения", value: "error" },
				{ label: "Всё, включая предупреждения", value: "warning" },
			],
		},
		{
			name: "dailyDigest",
			type: "checkbox",
			label: "Суточная сводка",
			defaultValue: true,
			admin: {
				description:
					"Письмо раз в сутки (09:00 МСК): сколько ошибок, какие, есть ли " +
					"упавшие фоновые задачи. Приходит и когда ошибок нет — его " +
					"отсутствие само по себе сигнал, что сайт не работает.",
			},
		},
		{
			type: "collapsible",
			label: "Предупреждения",
			admin: { initCollapsed: true },
			fields: [
				{
					name: "warningsEnabled",
					type: "checkbox",
					label: "Присылать предупреждения",
					defaultValue: false,
					admin: {
						description:
							"По умолчанию выключено: предупреждения обычно штатные и " +
							"реакции не требуют. В журнал они пишутся в любом случае. " +
							"Работает вместе с уровнем «Всё, включая предупреждения».",
					},
				},
				{
					name: "warningsModules",
					type: "textarea",
					label: "Только из этих модулей",
					admin: {
						description:
							"По одному префиксу на строку, например restock. Пустой список " +
							"означает «из любых».",
						condition: (data) => Boolean(data?.warningsEnabled),
					},
				},
			],
		},
		{
			type: "collapsible",
			label: "Повторы и лимиты",
			admin: { initCollapsed: true },
			fields: [
				{
					name: "cooldownBaseSeconds",
					type: "number",
					label: "Пауза после первого письма, секунд",
					defaultValue: 60,
					min: 10,
					max: 3_600,
					admin: {
						description:
							"Первое письмо по новой ошибке уходит сразу. Дальше пауза " +
							"удваивается с каждым письмом — до потолка ниже.",
					},
				},
				{
					name: "cooldownMaxSeconds",
					type: "number",
					label: "Потолок паузы, секунд",
					defaultValue: 21_600,
					min: 60,
					max: 86_400,
					admin: {
						description:
							"6 часов по умолчанию — четыре напоминания в сутки о давней " +
							"проблеме.",
					},
				},
				{
					name: "cooldownResetSeconds",
					type: "number",
					label: "Тишина, после которой ошибка снова считается новой, секунд",
					defaultValue: 21_600,
					min: 300,
					max: 604_800,
				},
				{
					name: "maxMessagesPerHour",
					type: "number",
					label: "Не больше писем в час",
					defaultValue: 20,
					min: 1,
					max: 500,
					admin: {
						description:
							"Общий потолок по всем ошибкам. Последнее письмо в пределах " +
							"лимита сообщает, что лимит исчерпан, — иначе тишину не " +
							"отличить от починки.",
					},
				},
				{
					name: "burstEscalation",
					type: "checkbox",
					label: "Прерывать паузу при резком росте",
					defaultValue: true,
					admin: {
						description:
							"100-й, 1000-й и 10000-й повтор ошибки приходят письмом, " +
							"даже если по ней идёт пауза.",
					},
				},
			],
		},
	],
};
