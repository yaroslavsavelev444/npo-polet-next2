import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { DeliveryMethod } from "./Orders.ts";

export const CheckoutPreferences: CollectionConfig = {
  slug: "checkout-preferences",

  admin: {
    useAsTitle: "user",
    group: "Магазин",
    description:
      "Сохранённые получатель/адрес для автозаполнения оформления заказа",
  },

  access: {
    read: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin" || req.user.role === "superadmin")
        return true;
      return { user: { equals: req.user.id } };
    },
    create: ({ req }) => !!req.user,
    update: ({ req }) => !!req.user,
    delete: isAdminOrSuperAdmin,
  },

  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      unique: true,
      index: true,
    },

    {
      name: "recipient",
      type: "group",
      label: "Сохранённый получатель",
      fields: [
        { name: "fullName", type: "text" },
        { name: "phone", type: "text" },
        { name: "email", type: "email" },
      ],
    },

    {
      name: "delivery",
      type: "group",
      label: "Сохранённая доставка",
      fields: [
        {
          name: "method",
          type: "select",
          options: [
            { label: "Курьер до двери", value: DeliveryMethod.DOOR_TO_DOOR },
            { label: "Доставка в ПВЗ", value: DeliveryMethod.PICKUP_POINT },
            { label: "Самовывоз", value: DeliveryMethod.SELF_PICKUP },
          ],
        },
        {
          name: "address",
          type: "group",
          fields: [
            { name: "street", type: "text" },
            { name: "city", type: "text" },
            { name: "postalCode", type: "text" },
            { name: "country", type: "text" },
          ],
        },
        {
          name: "transportCompany",
          type: "relationship",
          relationTo: "transport-companies",
        },
        {
          name: "pickupPoint",
          type: "relationship",
          relationTo: "pickup-points",
        },
      ],
    },
  ],
};
