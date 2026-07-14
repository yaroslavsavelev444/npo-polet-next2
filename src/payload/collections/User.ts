import type { CollectionConfig, FieldAccess } from "payload";
import { env } from "../../env.ts";
import { renderButton } from "../../services/email/templates/shared/button.ts";
import { renderEmailLayout } from "../../services/email/templates/shared/layout.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { checkUserStatus } from "../hooks/users/beforeLogin.ts";

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
		forgotPassword: {
			generateEmailSubject: () => "Восстановление пароля",
			generateEmailHTML: (args) => {
				const token = args?.token ?? "";
				const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/auth/password-reset?token=${token}`;
				const bodyHtml = `
        <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Восстановление пароля</h1>
        <p style="margin:0 0 20px;color:#52525B;">
          Вы запросили восстановление пароля. Ссылка действительна 1 час.
        </p>
        ${renderButton("Установить новый пароль", resetUrl)}
        <p style="margin:20px 0 0;color:#71717A;font-size:13px;">
          Если вы не запрашивали восстановление — проигнорируйте это письмо.
        </p>
      `;
				return renderEmailLayout({
					previewText: "Восстановление пароля",
					bodyHtml,
				});
			},
		},
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
		// Хранит, прошёл ли пользователь второй фактор
		{
			name: "twoFAVerified",
			type: "checkbox",
			defaultValue: false,
			label: "2FA подтверждён",
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
		legacyIdField,
	],
};
