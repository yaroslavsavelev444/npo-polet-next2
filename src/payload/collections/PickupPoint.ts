import type { CollectionConfig } from "payload";

const PickupPoints: CollectionConfig = {
  slug: "pickup-points",
  admin: {
    useAsTitle: "name",
    group: "Доставка",
    defaultColumns: ["name", "city", "isActive"],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "address", type: "text", required: true },
    { name: "city", type: "text" },
    { name: "phone", type: "text" },
    { name: "workingHours", type: "text" },
    {
      name: "coordinates",
      type: "group",
      fields: [
        { name: "lat", type: "number" },
        { name: "lng", type: "number" },
      ],
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

export default PickupPoints;
