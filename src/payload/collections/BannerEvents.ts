import type { CollectionConfig } from "payload";
import {
	BANNER_CLOSE_METHODS,
	BANNER_EVENT_KINDS,
} from "../../modules/banners/vocabulary.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

// Журнал взаимодействий с баннерами.
//
// Append-only. Ни одна строка здесь никогда не обновляется, и это не
// дисциплина, а свойство: аналитика, которую можно задним числом поправить,
// отвечает на вопрос «что мы думаем сейчас», а не «что произошло тогда».
// Именно поэтому `outcome` записывается отдельным событием, а не выводится из
// остальных при чтении: правило успеха у баннера меняется, и отчёт за прошлый
// месяц не должен меняться вместе с ним.
//
// ─── Что здесь есть и чего нет ─────────────────────────────────────────────
//
// Каждое поле обязано отвечать на вопрос, ради которого его будут читать:
//
//   kind + at     — воронка: выдано → показано → прочитано → нажато
//   impressionId  — склейка событий одного показа и ключ идемпотентности
//   dwellMs       — сколько провисела модалка (от открытия до события)
//   closeMethod   — крестик, клик мимо, Esc, переход по кнопке
//   sequence      — какой это показ по счёту у этого пользователя
//   path          — на каком экране застали пользователя
//
// Чего нет намеренно: координат курсора, размера окна, `userAgent`. По ним
// невозможно принять ни одного решения о баннере, а храниться они будут долго
// и на каждое движение.
//
// ─── Срок хранения ─────────────────────────────────────────────────────────
//
// Строки не удаляются автоматически: в Полёте нет ни планировщика, ни
// TTL-механизма, а заводить их ради одной коллекции — несоразмерно. Объём
// оценивается сверху тремя показами на человека в сутки (`BANNER_DAILY_LIMIT`)
// и четырьмя-пятью строками на показ, то есть растёт медленно и предсказуемо.
// Когда чистка понадобится, она делается одним `DELETE … WHERE at < …` в
// миграции или скриптом — как и остальная разовая работа с базой в этом
// проекте.

export const BannerEvents: CollectionConfig = {
	slug: "banner-events",
	labels: {
		singular: "Событие баннера",
		plural: "События баннеров",
	},

	admin: {
		group: "Система",
		useAsTitle: "id",
		defaultColumns: ["banner", "user", "kind", "at", "closeMethod"],
		description:
			"Журнал только для чтения: воронка показов баннеров и способы их закрытия.",
		hidden: true,
	},

	access: {
		read: isAdminOrSuperAdmin,
		create: () => false,
		update: () => false,
		delete: () => false,
	},

	indexes: [
		// Идемпотентность, и она стоит В БАЗЕ, а не в коде. Повторная отправка
		// закрытия (ретрай запроса, вторая вкладка, двойной вызов эффекта в
		// StrictMode) падает на нарушении уникальности и обрабатывается как «уже
		// записано», вместо того чтобы удвоить длительность просмотра в отчёте.
		//
		// Ключ включает `kind`, потому что у одного показа событий несколько; и
		// не включает пользователя, потому что `impressionId` уже уникален
		// глобально — добавление пользователя удлинило бы индекс, ничего не
		// проверяя.
		{ fields: ["impressionId", "kind"], unique: true },
		// Воронка по баннеру: «сколько показали, сколько дочитали, сколько нажали».
		{ fields: ["banner", "kind"] },
		// Темп показов у одного человека: последний показ и число показов за
		// сутки — два запроса, которые идут на каждую выдачу баннера.
		{ fields: ["user", "kind", "at"] },
	],

	fields: [
		{
			name: "banner",
			type: "relationship",
			relationTo: "banners",
			required: true,
			index: true,
			label: "Баннер",
		},
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Пользователь",
		},
		{
			name: "impressionId",
			type: "text",
			required: true,
			index: true,
			label: "Идентификатор показа",
		},
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			label: "Событие",
			options: [
				{ label: "Выдан клиенту", value: "delivered" },
				{ label: "Показан", value: "impression" },
				{ label: "Прочитан", value: "view" },
				{ label: "Нажата кнопка", value: "cta" },
				{ label: "Переход по ссылке", value: "link" },
				{ label: "Закрыт", value: "dismiss" },
				{ label: "Цель достигнута", value: "outcome" },
			] satisfies {
				label: string;
				value: (typeof BANNER_EVENT_KINDS)[number];
			}[],
		},
		{
			name: "at",
			type: "date",
			required: true,
			index: true,
			label: "Когда",
		},
		{
			name: "sequence",
			type: "number",
			required: true,
			defaultValue: 1,
			min: 1,
			label: "Номер показа",
		},
		{
			name: "dwellMs",
			type: "number",
			min: 0,
			label: "Время просмотра, мс",
			admin: {
				description: "Только у «прочитан», «закрыт» и «цель достигнута».",
			},
		},
		{
			name: "closeMethod",
			type: "select",
			label: "Способ закрытия",
			options: BANNER_CLOSE_METHODS.map((value) => ({ label: value, value })),
		},
		{
			name: "path",
			type: "text",
			label: "Страница",
		},
		{
			name: "href",
			type: "text",
			label: "Адрес перехода",
			admin: { description: "Только у «нажата кнопка» и «переход по ссылке»." },
		},
	],
};
