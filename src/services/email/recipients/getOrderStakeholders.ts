import type { Order, User } from "@/payload-types";
import type { EmailAddress } from "../types";

/** Извлекает адрес получателя заказа из уже загруженного документа Order. */
export function getOrderCustomerAddress(order: Order): EmailAddress {
  return { email: order.recipient.email, name: order.recipient.fullName };
}

export function isPopulatedUser(value: number | User): value is User {
  return typeof value === "object" && value !== null;
}
