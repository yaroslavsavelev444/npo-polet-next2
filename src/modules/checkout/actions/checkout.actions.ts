"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import {
  clearCartItems,
  getCartByUserId,
} from "@/payload/services/carts.service";
import { saveCheckoutPreferences } from "@/payload/services/checkout-preferences.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { createOrderFromCheckout } from "@/payload/services/orders.service";
import { checkoutSchema } from "../lib/checkout-schema";
import type { CheckoutActionResult, CheckoutSubmitInput } from "../types";

export async function submitOrderAction(
  input: CheckoutSubmitInput,
): Promise<CheckoutActionResult> {
  const user = await getCurrentUser();
  if (!user)
    return {
      success: false,
      error: "AUTH_REQUIRED",
      message: "Войдите в аккаунт, чтобы оформить заказ",
    };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: firstIssue?.message ?? "Проверьте введённые данные",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      ),
    };
  }

  const cartDoc = await getCartByUserId(String(user.id));
  const cartView = await buildCartView(cartDoc);

  if (cartView.items.length === 0) {
    return { success: false, error: "CART_EMPTY", message: "Корзина пуста" };
  }
  if (!cartView.validation.isValid) {
    return {
      success: false,
      error: "CART_INVALID",
      message:
        cartView.validation.issues[0]?.message ??
        "Проверьте количество товаров в корзине",
    };
  }

  const { ip, userAgent } = await getRequestMeta();
  const form = parsed.data;

  // ── Company: create if new + save requested ────────────────────────────
  let companyForm = form.company;
  if (
    companyForm?.isCompany &&
    !companyForm.existingCompanyId &&
    companyForm.saveCompany
  ) {
    const payload = await getPayloadInstance();
    const created = await payload.create({
      collection: "companies",
      data: {
        user: user.id,
        companyName: companyForm.companyName!,
        legalAddress: companyForm.legalAddress!,
        companyAddress: companyForm.companyAddress,
        taxNumber: companyForm.taxNumber!,
        contactPerson: companyForm.contactPerson,
      },
      overrideAccess: true,
    });
    companyForm = { ...companyForm, existingCompanyId: String(created.id) };
  }

  const order = await createOrderFromCheckout({
    userId: String(user.id),
    cart: cartView,
    form: { ...form, company: companyForm },
    meta: { ip, userAgent },
  });

  // ── Persist "save for next time" preferences ────────────────────────────
  await saveCheckoutPreferences(String(user.id), {
    recipient: form.recipient.saveRecipient
      ? {
          fullName: form.recipient.fullName,
          phone: form.recipient.phone,
          email: form.recipient.email,
        }
      : undefined,
    delivery: form.delivery.saveAddress
      ? {
          method: form.delivery.method,
          address: form.delivery.address,
          transportCompanyId: form.delivery.transportCompanyId,
          pickupPointId: form.delivery.pickupPointId,
        }
      : undefined,
  });

  await clearCartItems(String(user.id));
  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/orders");

  return { success: true, data: { orderNumber: order.orderNumber as string } };
}
