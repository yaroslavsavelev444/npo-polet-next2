import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { WishlistPageClient } from "@/modules/wishlist/components/WishlistPageClient";
import { buildWishlistView } from "@/modules/wishlist/lib/build-wishlist-view";
import { getWishlistByUserId } from "@/payload/services/wishlists.service";

export const metadata = {
  title: "Избранное",
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?from=/wishlist");
  }

  const wishlist = await getWishlistByUserId(String(user.id));
  const wishlistView = buildWishlistView(wishlist);

  return <WishlistPageClient initialWishlist={wishlistView} />;
}
