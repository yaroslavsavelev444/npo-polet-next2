// src/payload/collections/Admins.ts
import type { CollectionConfig } from "payload";

export const Admins: CollectionConfig = {
  slug: "admins",

  admin: {
    useAsTitle: "email",
    group: "Система",
    description: "Учётные записи персонала. НЕ связано с покупателями (users).",
  },

  auth: {
    tokenExpiration: 60 * 60 * 8,

    maxLoginAttempts: 5,

    lockTime: 15 * 60 * 1000,

    // ВАЖНО: в установленной версии Payload (3.85.1) имя auth-cookie задаётся
    // ТОЛЬКО глобально, через `cookiePrefix` в payload.config.ts (по умолчанию
    // "payload" → cookie "payload-token"), и одинаково для ВСЕХ auth-коллекций
    // сразу — `auth.cookies` каждой отдельной коллекции такого свойства не
    // имеет (см. IncomingAuthType в node_modules/payload/dist/auth/types.d.ts).
    // То есть развести admins и users по разным именам cookie на уровне
    // коллекции в этой версии Payload архитектурно невозможно — и это не
    // баг: раз admin.npo-polet.ru и test.npo-polet.ru/npo-polet.ru — разные
    // хосты, а cookie здесь ставится без Domain (host-only), браузер и так
    // хранит её отдельно для каждого хоста и коллизии со стороны customer-
    // сессии не будет. Настоящая причина 403 на Settings/Media и 400 на
    // logout — не эта cookie, а ALLOWED_ORIGINS/CSRF в payload.config.ts,
    // см. подробный комментарий там.
    cookies: {
      secure: process.env.NODE_ENV === "production",

      sameSite: "Lax",
    },
  },

  access: {
    // Читать/видеть список админов могут только сами админы
    read: ({ req }) => req.user?.collection === "admins",
    // Создавать нового админа может ТОЛЬКО superadmin. Публичная регистрация невозможна в принципе.
    create: ({ req }) =>
      req.user?.collection === "admins" && req.user?.role === "superadmin",
    update: ({ req }) => {
      if (req.user?.collection !== "admins") return false;
      if (req.user.role === "superadmin") return true;
      return { id: { equals: req.user.id } }; // обычный admin правит только себя
    },
    delete: ({ req }) =>
      req.user?.collection === "admins" && req.user?.role === "superadmin",
  },

  fields: [
    { name: "name", type: "text", required: true, label: "Имя" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "admin",
      options: [
        { label: "Администратор", value: "admin" },
        { label: "Суперадминистратор", value: "superadmin" },
      ],
    },
  ],
};
