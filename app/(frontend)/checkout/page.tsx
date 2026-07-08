import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { CheckoutPageClient } from "@/modules/checkout";
import { buildCheckoutView } from "@/modules/checkout/lib/build-checkout-view";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Оформление заказа",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?from=/checkout");

  const checkoutView = await buildCheckoutView(String(user.id));

  if (checkoutView.cart.items.length === 0) {
    redirect("/cart");
  }

  return (
    <CheckoutPageClient
      initialView={checkoutView}
      user={{ name: user.name as string, email: user.email as string }}
    />
  );
}
