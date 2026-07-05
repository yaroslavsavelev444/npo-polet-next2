import type { CheckoutDeliveryMethod, CheckoutPaymentMethod } from "../types";

const SELF_PICKUP_METHODS: CheckoutPaymentMethod[] = [
  "invoice",
  "self_pickup_card",
  "self_pickup_cash",
];
const REMOTE_DELIVERY_METHODS: CheckoutPaymentMethod[] = ["invoice"];

export function getAvailablePaymentMethods(
  delivery: CheckoutDeliveryMethod,
): CheckoutPaymentMethod[] {
  return delivery === "self_pickup"
    ? SELF_PICKUP_METHODS
    : REMOTE_DELIVERY_METHODS;
}

/** "Наличными при самовывозе" is the required default — but only when self_pickup is actually selected. */
export function getDefaultPaymentMethod(
  delivery: CheckoutDeliveryMethod,
): CheckoutPaymentMethod {
  return delivery === "self_pickup" ? "self_pickup_cash" : "invoice";
}

export function isPaymentMethodCompatible(
  delivery: CheckoutDeliveryMethod,
  payment: CheckoutPaymentMethod,
): boolean {
  return getAvailablePaymentMethods(delivery).includes(payment);
}
