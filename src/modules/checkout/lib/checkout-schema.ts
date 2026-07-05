import { z } from "zod";
import { validateInn } from "./validate-inn";

const addressSchema = z.object({
  street: z.string().min(3, "Укажите улицу и дом"),
  city: z.string().min(2, "Укажите город"),
  postalCode: z.string().regex(/^\d{6}$/, "Индекс должен содержать 6 цифр"),
  country: z.string().min(1),
});

export const checkoutSchema = z
  .object({
    recipient: z.object({
      fullName: z.string().trim().min(4, "Укажите ФИО получателя"),
      phone: z.string().regex(/^\+?\d{10,15}$/, "Некорректный формат телефона"),
      email: z.string().email("Некорректный email"),
      saveRecipient: z.boolean(),
    }),
    delivery: z.object({
      method: z.enum(["door_to_door", "pickup_point", "self_pickup"]),
      address: addressSchema.optional(),
      transportCompanyId: z.string().optional(),
      pickupPointId: z.string().optional(),
      notes: z.string().max(1000).optional(),
      saveAddress: z.boolean(),
    }),
    company: z
      .object({
        isCompany: z.boolean(),
        existingCompanyId: z.string().optional(),
        companyName: z.string().optional(),
        legalAddress: z.string().optional(),
        companyAddress: z.string().optional(),
        taxNumber: z.string().optional(),
        contactPerson: z.string().optional(),
        saveCompany: z.boolean(),
      })
      .optional(),
    paymentMethod: z.enum(["invoice", "self_pickup_card", "self_pickup_cash"]),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    // Delivery-method-specific requirements
    if (data.delivery.method === "door_to_door") {
      if (!data.delivery.address)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address"],
          message: "Укажите адрес доставки",
        });
      if (!data.delivery.transportCompanyId)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "transportCompanyId"],
          message: "Выберите транспортную компанию",
        });
    }
    if (data.delivery.method === "pickup_point") {
      if (!data.delivery.address?.city)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address", "city"],
          message: "Укажите город назначения",
        });
      if (!data.delivery.transportCompanyId)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "transportCompanyId"],
          message: "Выберите транспортную компанию",
        });
    }
    if (
      data.delivery.method === "self_pickup" &&
      !data.delivery.pickupPointId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["delivery", "pickupPointId"],
        message: "Выберите пункт самовывоза",
      });
    }

    // Payment/delivery compatibility (self_pickup_* only for self_pickup)
    const remoteOnlyInvoice = data.delivery.method !== "self_pickup";
    if (remoteOnlyInvoice && data.paymentMethod !== "invoice") {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message:
          "Для выбранного способа доставки доступна только оплата по счету",
      });
    }

    // Company requirements
    if (data.company?.isCompany) {
      if (data.company.existingCompanyId) return;
      if (!data.company.companyName?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["company", "companyName"],
          message: "Укажите название компании",
        });
      }
      if (!data.company.legalAddress?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["company", "legalAddress"],
          message: "Укажите юридический адрес",
        });
      }
      const innError = data.company.taxNumber
        ? validateInn(data.company.taxNumber)
        : "Укажите ИНН";
      if (innError) {
        ctx.addIssue({
          code: "custom",
          path: ["company", "taxNumber"],
          message: innError,
        });
      }
    }
  });

export type CheckoutSchemaInput = z.infer<typeof checkoutSchema>;
