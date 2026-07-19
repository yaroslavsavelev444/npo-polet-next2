import { z } from "zod";
import { validateFullName } from "./validate-full-name";
import { validateInn } from "./validate-inn";
import { RU_PHONE_E164_RE } from "./phone";

// Все поля адреса опциональны на уровне базовой схемы — обязательность
// зависит от выбранного способа доставки и проверяется в superRefine ниже,
// иначе валидация адреса срабатывала бы даже для самовывоза.
const addressSchema = z.object({
  city: z.string().optional().default(""),
  street: z.string().optional().default(""),
  house: z.string().optional().default(""),
  apartment: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  country: z.string().optional().default("Россия"),
});

export const checkoutSchema = z
  .object({
    recipient: z.object({
      // Строгая проверка ФИО (не логин/имя аккаунта) — в superRefine ниже,
      // чтобы вернуть точное сообщение об ошибке.
      fullName: z.string().trim(),
      phone: z
        .string()
        .regex(RU_PHONE_E164_RE, "Укажите корректный номер телефона"),
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
    // Строгая валидация ФИО получателя (фамилия + имя [+ отчество]).
    const fullNameError = validateFullName(data.recipient.fullName);
    if (fullNameError) {
      ctx.addIssue({
        code: "custom",
        path: ["recipient", "fullName"],
        message: fullNameError,
      });
    }

    // Delivery-method-specific requirements — только для выбранного способа,
    // остальные способы не проверяются вовсе (self_pickup не требует адреса).
    if (data.delivery.method === "door_to_door") {
      const street = data.delivery.address?.street?.trim() ?? "";
      const city = data.delivery.address?.city?.trim() ?? "";
      const house = data.delivery.address?.house?.trim() ?? "";
      const postalCode = data.delivery.address?.postalCode ?? "";

      if (city.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address", "city"],
          message: "Укажите город",
        });
      if (street.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address", "street"],
          message: "Укажите улицу",
        });
      if (house.length < 1)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address", "house"],
          message: "Укажите номер дома",
        });
      if (!/^\d{6}$/.test(postalCode))
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "address", "postalCode"],
          message: "Индекс должен содержать 6 цифр",
        });
      if (!data.delivery.transportCompanyId)
        ctx.addIssue({
          code: "custom",
          path: ["delivery", "transportCompanyId"],
          message: "Выберите транспортную компанию",
        });
    }
    if (data.delivery.method === "pickup_point") {
      if (!data.delivery.address?.city?.trim())
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
