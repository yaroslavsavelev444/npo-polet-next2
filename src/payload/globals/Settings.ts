// src/globals/Settings.ts
import { revalidateTag } from "next/cache.js";
import type { GlobalConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { seoField } from "../fields/seo.ts";

export const Settings: GlobalConfig = {
  slug: "settings",
  label: "Настройки сайта",
  access: {
    read: () => true,
    // Раньше проверялась только req.user.role без учёта коллекции — этому
    // условию мог удовлетворить не только персонал (admins), но и обычный
    // покупатель (users), у которого поле role совпадает по значению
    // ('admin' | 'superadmin'). isAdminOrSuperAdmin — единый хелпер,
    // используемый во всех остальных коллекциях, — дополнительно требует
    // req.user.collection === 'admins', что и есть реальная граница между
    // персоналом и покупателями в этом проекте.
    update: isAdminOrSuperAdmin,
  },
  hooks: {
    // getCachedSettings кэширует global с revalidate:false — без этого хука
    // правки в настройках (включая фон Hero) не были бы видны на сайте
    // до редеплоя.
    afterChange: [
      () => {
        revalidateTag("settings", "max");
      },
    ],
  },
  fields: [
    // ── Основная информация ──
    {
      name: "companyName",
      type: "text",
      required: true,
      label: "Название компании",
    },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      required: true,
      label: "Логотип",
    },
    {
      name: "legalAddress",
      type: "text",
      label: "Юридический адрес",
    },
    {
      name: "physicalAddress",
      type: "text",
      label: "Физический адрес",
    },

    // ── Телефоны ──
    {
      name: "phones",
      type: "array",
      label: "Телефоны",
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Поддержка", value: "support" },
            { label: "Продажи", value: "sales" },
            { label: "Общий", value: "general" },
            { label: "Факс", value: "fax" },
            { label: "Бухгалтерия", value: "accounting" },
            { label: "Другое", value: "other" },
          ],
          defaultValue: "general",
        },
        {
          name: "value",
          type: "text",
          required: true,
          label: "Номер телефона",
          validate: (value: string | string[] | null | undefined) => {
            if (!value || typeof value !== "string")
              return "Номер телефона обязателен";
            const cleaned = value.replace(/[\s\-()]/g, "");
            return /^\+?\d{10,15}$/.test(cleaned) || "Неверный формат телефона";
          },
        },
        {
          name: "description",
          type: "text",
          label: "Описание",
        },
        {
          name: "isPrimary",
          type: "checkbox",
          label: "Основной",
          defaultValue: false,
        },
        {
          name: "sortOrder",
          type: "number",
          label: "Порядок сортировки",
          defaultValue: 0,
        },
      ],
    },

    // ── Email-адреса ──
    {
      name: "emails",
      type: "array",
      label: "Электронная почта",
      fields: [
        {
          name: "type",
          type: "select",
          options: [
            { label: "Общий", value: "general" },
            { label: "Поддержка", value: "support" },
            { label: "Информация", value: "info" },
            { label: "Продажи", value: "sales" },
            { label: "Безопасность", value: "security" },
            { label: "HR", value: "hr" },
            { label: "Другое", value: "other" },
          ],
          defaultValue: "general",
        },
        {
          name: "value",
          type: "email",
          required: true,
          label: "Email",
        },
        {
          name: "description",
          type: "text",
          label: "Описание",
        },
        {
          name: "isPrimary",
          type: "checkbox",
          label: "Основной",
          defaultValue: false,
        },
        {
          name: "sortOrder",
          type: "number",
          label: "Порядок сортировки",
          defaultValue: 0,
        },
      ],
    },

    // ── Социальные сети ──
    {
      name: "socialLinks",
      type: "array",
      label: "Социальные сети",
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          options: [
            { label: "Telegram", value: "telegram" },
            { label: "WhatsApp", value: "whatsapp" },
            { label: "ВКонтакте", value: "vk" },
            { label: "GitHub", value: "github" },
            { label: "Max (?)", value: "max" },
            { label: "Другое", value: "other" },
          ],
        },
        {
          name: "url",
          type: "text",
          required: true,
          label: "URL",
          validate: (value: string | string[] | null | undefined) => {
            if (!value || typeof value !== "string") return "URL обязателен";
            try {
              new URL(value);
              return true;
            } catch {
              return "Неверный формат URL";
            }
          },
        },
        {
          name: "title",
          type: "text",
          label: "Название (опционально)",
        },
        {
          name: "sortOrder",
          type: "number",
          label: "Порядок сортировки",
          defaultValue: 0,
        },
      ],
    },

    // ── Прочие контакты ──
    {
      name: "otherContacts",
      type: "array",
      label: "Другие контакты",
      fields: [
        {
          name: "type",
          type: "select",
          required: true,
          options: [
            { label: "Мессенджер", value: "messenger" },
            { label: "Форум", value: "forum" },
            { label: "Пользовательский", value: "custom" },
            { label: "Чат", value: "chat" },
            { label: "Бот", value: "bot" },
          ],
        },
        {
          name: "name",
          type: "text",
          required: true,
          label: "Название",
        },
        {
          name: "value",
          type: "text",
          required: true,
          label: "Значение",
        },
        {
          name: "description",
          type: "text",
          label: "Описание",
        },
        {
          name: "sortOrder",
          type: "number",
          label: "Порядок сортировки",
          defaultValue: 0,
        },
      ],
    },

    // ── Ограничения ──
    {
      name: "restrictions",
      type: "group",
      label: "Ограничения",
      fields: [
        {
          name: "disableRegistration",
          type: "checkbox",
          label: "Отключить регистрацию",
          defaultValue: false,
        },
        {
          name: "disableOrdering",
          type: "checkbox",
          label: "Отключить возможность заказать товар",
          defaultValue: false,
        },
      ],
    },

    // ── Фон первого экрана (Hero) ──
    {
      name: "heroBackground",
      type: "group",
      label: "Фон первого экрана (Hero)",
      fields: [
        {
          name: "type",
          type: "select",
          label: "Тип фона",
          defaultValue: "none",
          options: [
            { label: "Нет (стандартный фон)", value: "none" },
            { label: "Изображение", value: "image" },
            { label: "Видео", value: "video" },
          ],
        },
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          label: "Фоновое изображение",
          admin: {
            condition: (_, siblingData) => siblingData?.type === "image",
            description: "Горизонтальное изображение, не менее 1920×1080px.",
          },
        },
        {
          name: "video",
          type: "upload",
          relationTo: "media",
          label: "Фоновое видео",
          admin: {
            condition: (_, siblingData) => siblingData?.type === "video",
            description:
              "MP4/WebM без звука, короткий зацикленный ролик. Для быстрой загрузки желательно сжать файл (H.264, до ~8МБ).",
          },
        },
        {
          name: "videoPoster",
          type: "upload",
          relationTo: "media",
          label: "Постер видео",
          admin: {
            condition: (_, siblingData) => siblingData?.type === "video",
            description: "Показывается, пока видео ещё грузится, и на медленном интернете.",
          },
        },
      ],
    },

    // ── Рабочие часы и карта ──
    {
      name: "workingHours",
      type: "text",
      label: "Часы работы",
    },
    {
      name: "map",
      type: "textarea",
      label: "Код карты (iframe src или embed)",
    },

    // ── SEO ──
    seoField,
  ],
};
