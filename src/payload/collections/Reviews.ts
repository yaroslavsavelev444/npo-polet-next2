import type { CollectionConfig } from "payload";
import { getProductHref } from "../../modules/productCard/lib/routing.ts";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { notifyReviewStatusChanged } from "../../services/notifications/notifyReviewStatusChanged.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";

export const ProductReviews: CollectionConfig = {
  slug: "product-reviews",

  admin: {
    useAsTitle: "title",
    group: "Магазин",
    defaultColumns: ["product", "user", "rating", "status", "createdAt"],
  },

  access: {
    read: () => true,

    create: ({ req }) => !!req.user,

    update: isAdminOrSuperAdmin,

    delete: isAdminOrSuperAdmin,
  },

  timestamps: true,

  hooks: {
    beforeValidate: [
      async ({ data, req, operation }) => {
        if (operation !== "create" || !data?.user || !data?.product) {
          return data;
        }

        const existing = await req.payload.find({
          collection: "product-reviews",
          where: {
            and: [
              {
                user: {
                  equals: data.user,
                },
              },
              {
                product: {
                  equals: data.product,
                },
              },
            ],
          },
          limit: 1,
        });

        if (existing.docs.length) {
          throw new Error("Отзыв для данного товара уже существует");
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (operation === "update" && previousDoc?.status !== doc.status) {
          const populated = await req.payload.findByID({
            collection: "product-reviews",
            id: doc.id,
            depth: 2,
            overrideAccess: true,
          });
          void notifyReviewStatusChanged(populated);

          if (populated.status === "approved" || populated.status === "rejected") {
            const user = populated.user;
            const product = populated.product;
            if (typeof user === "object" && typeof product === "object") {
              const productUrl = getProductHref({ id: String(product.id), category: null });
              void notify(
                req.payload,
                user.id,
                populated.status === "approved" ? "review_approved" : "review_rejected",
                {
                  productTitle: product.title,
                  productUrl,
                  ...(populated.status === "rejected" && {
                    reason: populated.rejectionReason,
                  }),
                },
              );
            }
          }
        }
        return doc;
      },
    ],
  },

  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },

    {
      name: "product",
      type: "relationship",
      relationTo: "products",
      required: true,
      index: true,
    },

    {
      name: "rating",
      type: "number",
      required: true,
      min: 1,
      max: 5,
    },

    {
      name: "title",
      type: "text",
      maxLength: 200,
    },

    {
      name: "comment",
      type: "textarea",
      required: true,
    },

    {
      name: "pros",
      type: "array",
      fields: [
        {
          name: "value",
          type: "text",
        },
      ],
    },

    {
      name: "cons",
      type: "array",
      fields: [
        {
          name: "value",
          type: "text",
        },
      ],
    },

    {
      name: "status",
      type: "select",
      defaultValue: "pending",
      options: ["pending", "approved", "rejected"],
      index: true,
    },

    {
      name: "rejectionReason",
      type: "textarea",
      admin: {
        condition: (_, siblingData) => siblingData?.status === "rejected",
      },
    },

    {
      name: "isVerifiedPurchase",
      type: "checkbox",
      defaultValue: false,
    },

    {
      name: "helpfulCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },

    {
      name: "notHelpfulCount",
      type: "number",
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
  ],
};
