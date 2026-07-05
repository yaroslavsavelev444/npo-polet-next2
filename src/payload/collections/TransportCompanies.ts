import type { CollectionConfig } from "payload";

const TransportCompanies: CollectionConfig = {
  slug: "transport-companies",
  admin: {
    useAsTitle: "name",
    group: "Доставка",
    defaultColumns: ["name", "isActive", "phone"],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "phone", type: "text" },
    { name: "website", type: "text" },
    {
      name: "trackingUrlTemplate",
      type: "text",
      admin: {
        description:
          "Шаблон URL для отслеживания, например https://track.ru/{trackingNumber}",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
      admin: {
        position: "sidebar",
        description: "Показывать при оформлении заказа",
      },
    },
  ],
};

export default TransportCompanies;
