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
    cookies: {
      secure: true,
      sameSite: "Strict",
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
