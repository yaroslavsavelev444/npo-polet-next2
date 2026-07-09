// ─── Orders list & cancellation (append to existing file) ──────────────────

import type { Where } from "payload";
import { CheckoutSubmitInput } from "@/modules/checkout";
import type { Order } from "../../../payload-types";
import { CartView } from "../../modules/cart";
import { createRelationshipUser } from "../access/createRelationshipUser";
import { getPayloadInstance } from "./getPayload";

export interface CreateOrderInput {
  userId: string;
  cart: CartView;
  form: CheckoutSubmitInput;
  meta: { ip: string; userAgent: string };
}

export interface GetOrdersOptions {
  statuses?: Order["status"][] | null;
  page?: number;
  limit?: number;
}

export interface GetOrdersResult {
  docs: Order[];
  totalDocs: number;
  totalPages: number;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export async function getOrdersByUserId(
  userId: string,
  options: GetOrdersOptions = {},
): Promise<GetOrdersResult> {
  const payload = await getPayloadInstance();
  const { statuses, page = 1, limit = 10 } = options;

  const where: Where = {
    and: [
      { user: { equals: userId } },
      ...(statuses && statuses.length > 0
        ? [{ status: { in: statuses } }]
        : []),
    ],
  };

  const result = await payload.find({
    collection: "orders",
    where,
    sort: "-createdAt",
    page,
    limit,
    depth: 1,
    overrideAccess: true,
  });

  return {
    docs: result.docs as unknown as Order[],
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    page: result.page ?? page,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
  };
}

export async function getOrderByIdForUser(
  orderId: string,
  userId: string,
): Promise<Order | null> {
  const payload = await getPayloadInstance();

  let order: Order;
  try {
    order = (await payload.findByID({
      collection: "orders",
      id: orderId,
      depth: 2,
      overrideAccess: true,
    })) as unknown as Order;
  } catch {
    return null;
  }

  if (!order) return null;

  const orderUserId =
    typeof order.user === "object" ? order.user.id : order.user;
  if (String(orderUserId) !== String(userId)) return null;

  return order;
}

export type CancelOrderFailureReason = "not_found" | "not_cancellable";

export async function cancelOrderForUser(
  orderId: string,
  userId: string,
  reason: string,
): Promise<
  | { ok: true; status: Order["status"] }
  | { ok: false; reason: CancelOrderFailureReason }
> {
  const payload = await getPayloadInstance();

  let order: Order;
  try {
    order = (await payload.findByID({
      collection: "orders",
      id: orderId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Order;
  } catch {
    return { ok: false, reason: "not_found" };
  }

  if (!order) return { ok: false, reason: "not_found" };

  const orderUserId =
    typeof order.user === "object" ? order.user.id : order.user;
  if (String(orderUserId) !== String(userId)) {
    return { ok: false, reason: "not_found" };
  }

  if (
    order.status === "cancelled" ||
    order.status === "refunded" ||
    order.status === "delivered"
  ) {
    return { ok: false, reason: "not_cancellable" };
  }

  await payload.update({
    collection: "orders",
    id: orderId,
    data: {
      status: "cancelled",
      statusHistory: [
        ...(order.statusHistory ?? []),
        {
          status: "cancelled",
          changedAt: new Date().toISOString(),
          changedBy: createRelationshipUser("users", userId),
          comment: reason,
        },
      ],
    },
    overrideAccess: true,
  });

  return { ok: true, status: "cancelled" };
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
      orderNumber: "",
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
    draft: false,
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
