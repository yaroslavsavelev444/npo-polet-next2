import type { CollectionConfig } from "payload";
import { env } from "../../env.ts";
import { renderButton } from "../../services/email/templates/shared/button.ts";
import { renderEmailLayout } from "../../services/email/templates/shared/layout.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { checkUserStatus } from "../hooks/users/beforeLogin.ts";

export const Users: CollectionConfig = {
  slug: "users",

  auth: {
    tokenExpiration: 7 * 24 * 60 * 60,
    cookies: { secure: process.env.NODE_ENV === "production", sameSite: "Lax" },
    verify: false,
    forgotPassword: {
      generateEmailSubject: () => "Восстановление пароля",
      generateEmailHTML: ({ token }) => {
        const resetUrl = `${env.NODE_ENV ?? "http://localhost:3000"}/auth/password-reset?token=${token}`;
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
      if (req.user.role === "admin" || req.user.role === "superadmin")
        return true;
      // Пользователь может читать только свою запись
      return {
        id: { equals: req.user.id },
      };
    },
    create: () => true, // Регистрация открыта
    update: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin" || req.user.role === "superadmin")
        return true;
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
    },
    {
      name: "blockedUntil",
      type: "date",
      label: "Заблокирован до",
      admin: { position: "sidebar" },
    },

    // ── 2FA состояние ─────────────────────────────────────────────────────────
    // Хранит, прошёл ли пользователь второй фактор
    {
      name: "twoFAVerified",
      type: "checkbox",
      defaultValue: false,
      label: "2FA подтверждён",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "twoFAVerifiedAt",
      type: "date",
      label: "Дата подтверждения 2FA",
      admin: { position: "sidebar", readOnly: true },
    },

    // ── Email верификация ─────────────────────────────────────────────────────
    {
      name: "emailVerified",
      type: "checkbox",
      defaultValue: false,
      label: "Email подтверждён",
      admin: { position: "sidebar", readOnly: true },
    },

    // ── Аудит входа ──────────────────────────────────────────────────────────
    {
      name: "lastLoginAt",
      type: "date",
      label: "Последний вход",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "loginAttempts",
      type: "number",
      defaultValue: 0,
      label: "Неверных попыток входа",
      admin: { readOnly: true },
    },
    {
      name: "lockUntil",
      type: "date",
      label: "Аккаунт заблокирован до",
      admin: { readOnly: true },
    },
  ],
};
