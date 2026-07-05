// ─── Order creation ─────────────────────────────────────────────────────────

import type { CartView } from "@/modules/cart";
import type { CheckoutSubmitInput } from "@/modules/checkout/types";
import { getPayloadInstance } from "./getPayload";

interface CreateOrderInput {
  userId: string;
  cart: CartView;
  form: CheckoutSubmitInput;
  meta: { ip: string; userAgent: string };
}

export async function createOrderFromCheckout({
  userId,
  cart,
  form,
  meta,
}: CreateOrderInput) {
  const payload = await getPayloadInstance();

  const items = cart.items.map((item) => ({
    product: Number(item.product.id),
    name: item.product.title,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.itemDiscount,
    totalPrice: item.subtotal,
  }));

  const appliedDiscounts = cart.discounts.applied.map((d) => ({
    discountId: Number(d.id),
    name: d.name,
    discountPercent: d.discountPercent,
    discountAmount: d.amount,
    message: d.message,
  }));

  const companyInfo = form.company?.isCompany
    ? {
        companyId: form.company.existingCompanyId
          ? Number(form.company.existingCompanyId)
          : undefined,
        name: form.company.companyName,
        legalAddress: form.company.legalAddress,
        companyAddress: form.company.companyAddress,
        taxNumber: form.company.taxNumber,
        contactPerson: form.company.contactPerson,
      }
    : undefined;

  const order = await payload.create({
    collection: "orders",
    data: {
      // orderNumber: "",
      user: Number(userId),
      status: "pending",
      recipient: {
        fullName: form.recipient.fullName,
        phone: form.recipient.phone,
        email: form.recipient.email,
      },
      delivery: {
        method: form.delivery.method,
        address:
          form.delivery.method === "self_pickup"
            ? undefined
            : {
                street: form.delivery.address?.street,
                city: form.delivery.address?.city,
                postalCode: form.delivery.address?.postalCode,
                country: form.delivery.address?.country ?? "Россия",
              },
        transportCompany: form.delivery.transportCompanyId
          ? Number(form.delivery.transportCompanyId)
          : undefined,
        pickupPoint: form.delivery.pickupPointId
          ? Number(form.delivery.pickupPointId)
          : undefined,
        notes: form.delivery.notes,
      },
      items,
      pricing: {
        subtotal: cart.summary.priceWithoutDiscount,
        productDiscounts: cart.summary.productDiscountAmount,
        centralDiscountAmount: cart.summary.centralDiscountAmount,
        centralDiscountPercent: cart.summary.centralDiscountPercent,
        discount: cart.summary.totalDiscount,
        shippingCost: 0,
        total: cart.summary.totalPrice,
        currency: "RUB",
      },
      payment: {
        method: form.paymentMethod,
        status: "pending",
      },
      appliedDiscounts,
      companyInfo,
      notes: form.notes,
      source: "web",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      statusHistory: [
        {
          status: "pending",
          changedAt: new Date().toISOString(),
          comment: "Заказ создан",
        },
      ],
    },
    overrideAccess: true,
    draft: false, // <-- добавлено
  });

  return order;
}

export async function getCachedOrderByOrderNumberForUser(
  orderNumber: string,
  userId: string,
) {
  const payload = await getPayloadInstance();
  const { docs } = await payload.find({
    collection: "orders",
    where: {
      and: [
        { orderNumber: { equals: orderNumber } },
        { user: { equals: userId } },
      ],
    },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  });
  return docs[0] ?? null;
}
