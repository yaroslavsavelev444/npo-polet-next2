// app/(frontend)/cart/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { CartPageClient } from "@/modules/cart/components/CartPageClient";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { getCartByUserId } from "@/payload/services/carts.service";

export const metadata = {
  title: "Корзина",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?from=/cart");
  }

  const cart = await getCartByUserId(String(user.id));
  const cartView = await buildCartView(cart);

  return <CartPageClient initialCart={cartView} />;
}
