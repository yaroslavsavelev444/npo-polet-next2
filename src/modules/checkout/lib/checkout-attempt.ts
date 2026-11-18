import type { CartView } from "@/modules/cart/types";

export const CHECKOUT_ATTEMPT_PARAM = "attempt";

export function isCheckoutAttemptId(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
			value,
		)
	);
}

export function getCheckoutCartKey(cart: CartView): string {
	return [
		cart.summary.priceWithoutDiscount,
		cart.summary.totalPrice,
		...cart.items
			.map(
				(item) => `${item.product.id}x${item.quantity}:${item.unitFinalPrice}`,
			)
			.sort(),
	].join("|");
}
