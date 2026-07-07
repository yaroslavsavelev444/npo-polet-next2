import type { Order, User } from "../../../../payload-types.ts";
import type { EmailAddress } from "../types.ts";

export function getOrderCustomerAddress(order: Order): EmailAddress {
  return { email: order.recipient.email, name: order.recipient.fullName };
}

export function isPopulatedUser(value: number | User): value is User {
  return typeof value === "object" && value !== null;
}
