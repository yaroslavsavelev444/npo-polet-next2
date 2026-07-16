import type { CollectionAfterChangeHook, CollectionConfig, FieldAccess } from "payload";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { checkUserStatus } from "../hooks/users/beforeLogin.ts";

/**
 * Реагирует на изменение status администратором (поле доступно на update
 * только staff, см. staffOnlyFieldAccess ниже) — уведомляет пользователя о
 * блокировке/приостановке/восстановлении доступа. beforeLogin-хук
 * (checkUserStatus) не подходит для этого: он вызывается только в момент
 * логина уже заблокированного юзера, а здесь нужна реакция В МОМЕНТ, когда
 * админ поменял статус, независимо от того, залогинен ли пользователь.
 */
const notifyOnStatusChange: CollectionAfterChangeHook = async ({
	doc,
	previousDoc,
	operation,
	req,
}) => {
	if (operation !== "update" || req.context?.isMigration) return doc;
	if (previousDoc?.status === doc.status) return doc;

	if (doc.status === "blocked") {
		void notify(req.payload, doc.id, "account_blocked", {});
	} else if (doc.status === "suspended") {
		void notify(req.payload, doc.id, "account_suspended", {});
	} else if (
		doc.status === "active" &&
		(previousDoc?.status === "blocked" || previousDoc?.status === "suspended")
	) {
		void notify(req.payload, doc.id, "account_reactivated", {});
	}

	return doc;
};

// `isAdminOrSuperAdmin` из ../access/isAdminOrSuperAdmin.ts типизирован как
// `Access` (коллекционный контроль доступа) и не может напрямую переиспользоваться
// в `field.access` — там ожидается `FieldAccess`, у которого другая форма
// аргументов (в частности, `id: number | string`, тогда как `Access` в этом
// проекте сужен до `id: number`). Логика идентична, но нужен отдельный,
// корректно типизированный хелпер для полей.
const staffOnlyFieldAccess: FieldAccess = ({ req }) =>
	req.user?.collection === "admins" &&
	["admin", "superadmin"].includes(req.user.role ?? "");

export const Users: CollectionConfig = {
	slug: "users",

	auth: {
		tokenExpiration: 7 * 24 * 60 * 60,
		cookies: { secure: process.env.NODE_ENV === "production", sameSite: "Lax" },
		verify: false,
		// Задаём явно (иначе Payload берёт свои дефолты 5 попыток / 10 минут):
		// поля loginAttempts/lockUntil ниже в fields — те же самые, которые
		// использует встроенный механизм блокировки Payload (см. коллизию имён
		// в getAuthFields.js/accountLock.js) — раньше поверх них ещё крутилась
		// собственная ручная блокировка в loginAction (handleFailedLogin),
		// которая читала эти поля через payload.find() без showHiddenFields и
		// получала undefined (Payload прячет hidden-поля при чтении) — из-за
		// этого счётчик каждый раз сбрасывался обратно к 1, и блокировка по
		// факту не работала вообще. Ручная реализация удалена, используется
		// только встроенный механизм Payload.
		maxLoginAttempts: 10,
		lockTime: 15 * 60 * 1000,
		// generateEmailSubject/generateEmailHTML сюда намеренно не возвращаем:
		// forgotPasswordAction вызывает payload.forgotPassword с
		// disableEmail: true и шлёт письмо сам через notifyPasswordReset
		// (см. её докстринг) — эти колбэки Payload вызывает только из
		// собственного email-адаптера, который при disableEmail: true не
		// выполняется вообще, так что здесь они были бы мёртвым кодом.
		forgotPassword: {},
	},

	admin: {
		useAsTitle: "email",
		defaultColumns: ["email", "name", "role", "status", "lastLoginAt"],
		group: "Пользователи",
	},

	access: {
		read: ({ req }) => {
			if (!req.user) return false;
			// Staff (коллекция admins) видит всех покупателей. Проверяем именно
			// collection, а не только role — начиная с этой ревизии значение
			// role у обычного покупателя вообще не может стать "admin"/"superadmin"
			// (см. access.update на самом поле role ниже), но проверка на
			// коллекцию — это независимая, не зависящая от состояния данных
			// граница, и именно её используют все остальные коллекции проекта.
			if (req.user.collection === "admins") return true;
			// Покупатель может читать только свою запись
			return {
				id: { equals: req.user.id },
			};
		},
		create: () => true, // Регистрация открыта
		update: ({ req }) => {
			if (!req.user) return false;
			if (req.user.collection === "admins") return true;
			return { id: { equals: req.user.id } };
		},
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeLogin: [checkUserStatus],
		afterChange: [notifyOnStatusChange],
	},

	fields: [
		// ── Основные данные ───────────────────────────────────────────────────────
		{
			name: "name",
			type: "text",
			required: true,
			label: "Имя",
		},

		// ── Роль и статус ─────────────────────────────────────────────────────────
		{
			name: "role",
			type: "select",
			required: true,
			defaultValue: "user",
			label: "Роль",
			options: [
				{ label: "Пользователь", value: "user" },
				{ label: "Администратор", value: "admin" },
				{ label: "Суперадминистратор", value: "superadmin" },
			],
			admin: { position: "sidebar" },
			// Коллекционный access.update разрешает пользователю патчить СВОЙ же
			// документ (`{ id: { equals: req.user.id } }`), а `admin.readOnly`
			// — это только подсказка для UI админки, она не защищает REST/GraphQL
			// API. Без явного access.update на самом поле обычный покупатель мог
			// отправить PATCH /api/users/<self> с `{ role: "superadmin" }` и
			// выдать себе права персонала. Поле правит роль — писать её могут
			// только сами admins (сервисные вызовы делают это через
			// overrideAccess: true и этим полностью обходят проверку).
			access: { update: staffOnlyFieldAccess },
		},
		{
			name: "status",
			type: "select",
			required: true,
			defaultValue: "active",
			label: "Статус",
			options: [
				{ label: "Активен", value: "active" },
				{ label: "Заблокирован", value: "blocked" },
				{ label: "Приостановлен", value: "suspended" },
			],
			admin: { position: "sidebar" },
			access: { update: staffOnlyFieldAccess },
		},
		{
			name: "blockedUntil",
			type: "date",
			label: "Заблокирован до",
			admin: { position: "sidebar" },
			access: { update: staffOnlyFieldAccess },
		},

		// ── 2FA состояние ─────────────────────────────────────────────────────────
		// ВНИМАНИЕ: это поле — АУДИТ, а не признак авторизации. Оно означает
		// «пользователь когда-либо проходил второй фактор» и остаётся true
		// после выхода, то есть на следующем входе оно уже true ДО ввода кода.
		// Именно поэтому по нему нельзя пускать/не пускать: раньше proxy.ts
		// делал ровно это (с окном в 24 часа) и пропускал повторный вход мимо
		// OTP. Признак завершённой авторизации — наличие payload-token,
		// который выдаётся только в verifyOtp.ts после проверки кода.
		{
			name: "twoFAVerified",
			type: "checkbox",
			defaultValue: false,
			label: "2FA подтверждён (аудит)",
			admin: { position: "sidebar", readOnly: true },
			// Пишется только сервисным кодом (verifyOtp.ts) через
			// overrideAccess: true после реальной проверки OTP-кода.
			access: { update: staffOnlyFieldAccess },
		},
		{
			name: "twoFAVerifiedAt",
			type: "date",
			label: "Дата подтверждения 2FA",
			admin: { position: "sidebar", readOnly: true },
			access: { update: staffOnlyFieldAccess },
		},

		// ── Email верификация ─────────────────────────────────────────────────────
		{
			name: "emailVerified",
			type: "checkbox",
			defaultValue: false,
			label: "Email подтверждён",
			admin: { position: "sidebar", readOnly: true },
			access: { update: staffOnlyFieldAccess },
		},

		// ── Аудит входа ──────────────────────────────────────────────────────────
		{
			name: "lastLoginAt",
			type: "date",
			label: "Последний вход",
			admin: { position: "sidebar", readOnly: true },
			access: { update: staffOnlyFieldAccess },
		},
		{
			name: "loginAttempts",
			type: "number",
			defaultValue: 0,
			label: "Неверных попыток входа",
			admin: { readOnly: true },
			access: { update: staffOnlyFieldAccess },
		},
		{
			name: "lockUntil",
			type: "date",
			label: "Аккаунт заблокирован до",
			admin: { readOnly: true },
			access: { update: staffOnlyFieldAccess },
		},

		// ── Миграция из старой системы ──────────────────────────────────────────
		// Старые пароли — bcrypt, новые (Payload local strategy) — PBKDF2-SHA256
		// с отдельными hash/salt (см. node_modules/payload/dist/auth/strategies/
		// local/{authenticate,generatePasswordSaltHash}.js) — форматы несовместимы,
		// прямой перенос хеша невозможен. Вместо принудительного сброса пароля
		// всем мигрированным пользователям храним старый bcrypt-хеш здесь и
		// проверяем его как fallback при неудачном обычном логине (см.
		// src/modules/auth/lib/legacyPasswordFallback.ts, используется в
		// loginAction). При успешной проверке пароль сразу перехешируется в
		// формат Payload и это поле очищается — то есть поле "тает" по мере
		// того, как мигрированные пользователи заходят на сайт.
		{
			name: "legacyPasswordHash",
			type: "text",
			admin: { hidden: true },
			access: {
				read: () => false,
				create: () => false,
				update: () => false,
			},
		},
		// Единственный надёжный признак того, что bcrypt-фоллбек для этого
		// пользователя уже сработал (см. legacyPasswordFallback.ts). Отличать
		// "уже мигрировал" от "хеш ещё не перенесён из старой БД" по одному
		// только пустому legacyPasswordHash нельзя — оба состояния выглядят
		// одинаково (null), а миграция должна уметь безопасно доносить
		// legacyPasswordHash при повторном прогоне для пользователей, которым
		// он не попал при первом переносе (например, поле добавили в схему
		// уже после первого прогона users.migration.ts) — не трогая при этом
		// тех, кто уже реально сменил пароль через фоллбек.
		{
			name: "legacyPasswordMigrated",
			type: "checkbox",
			defaultValue: false,
			admin: { hidden: true },
			access: {
				read: () => false,
				create: () => false,
				update: () => false,
			},
		},
		legacyIdField,
	],
};
