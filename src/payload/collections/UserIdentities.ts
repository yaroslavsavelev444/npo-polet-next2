import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";

/**
 * Привязки аккаунта к внешним сервисам входа (сейчас — только Яндекс ID).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ КЛЮЧ — ИДЕНТИФИКАТОР СЕРВИСА, А НЕ ПОЧТА
 * ────────────────────────────────────────────────────────────────────────────
 * Почту в Яндексе можно сменить, а чужую — завести там же. Пользователь
 * находится по паре (provider, subject), и только по ней; почта сервиса
 * участвует лишь один раз — когда привязки ещё нет и решается, к какому
 * аккаунту её создать (см. modules/auth/oauth/resolve.ts). Автоматической
 * привязки по совпадению почты нет никогда: сначала код на эту почту.
 *
 * `emailAtLink` — снимок почты сервиса на момент привязки: для кабинета
 * («привязан как …») и для разбора обращений. Ни на что не влияет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧЕГО ЗДЕСЬ НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Токенов сервиса. Они нужны ровно на одну операцию — прочитать профиль в
 * момент входа — и после неё забываются (см. oauth/yandex.ts).
 */
export const UserIdentities: CollectionConfig = {
	slug: "user-identities",

	admin: {
		group: "Пользователи",
		useAsTitle: "emailAtLink",
		defaultColumns: [
			"user",
			"provider",
			"emailAtLink",
			"lastUsedAt",
			"createdAt",
		],
		description:
			"Внешние сервисы, через которые покупатель входит на сайт. Удаление записи отвязывает сервис; войти им снова можно будет только после подтверждения почты кодом.",
	},

	access: {
		// Покупатель видит свои привязки («Способы входа» в кабинете), персонал — все.
		read: ownedByUserOrStaff,
		// Только через Local API: привязка даёт право входа в аккаунт, и
		// создавать её извне нельзя никому. Единственный путь — modules/auth/oauth.
		create: () => false,
		update: () => false,
		// Персонал отвязывает по обращению «потерял доступ к Яндексу».
		delete: isAdminOrSuperAdmin,
	},

	timestamps: true,

	indexes: [{ fields: ["provider", "subject"], unique: true }],

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Пользователь",
			admin: { readOnly: true },
		},
		{
			name: "provider",
			type: "select",
			required: true,
			label: "Сервис",
			options: [{ label: "Яндекс ID", value: "yandex" }],
			admin: { readOnly: true },
		},
		{
			// Идентификатор пользователя в сервисе (для Яндекса — поле `id` ответа
			// login.yandex.ru/info). Не секрет, но и показывать его незачем.
			name: "subject",
			type: "text",
			required: true,
			label: "Идентификатор в сервисе",
			admin: { readOnly: true, hidden: true },
		},
		{
			name: "emailAtLink",
			type: "text",
			label: "Почта сервиса при привязке",
			admin: { readOnly: true },
		},
		{
			name: "lastUsedAt",
			type: "date",
			label: "Последний вход",
			admin: { readOnly: true },
		},
	],
};
