import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import {
  getCartItemCount,
  getCartProductIds,
} from "@/payload/services/carts.service";
import { getCachedCategories } from "@/payload/services/categories.service";
import { getUnreadNotificationCount } from "@/payload/services/notifications.service";
import {
  getCachedCategoryPreviews,
  getCachedCategoryProductCounts,
} from "@/payload/services/products.service";
import { getCachedSettings } from "@/payload/services/settings.service";
import { getWishlistProductIds } from "@/payload/services/wishlists.service";
import { buildCatalogMenu } from "./catalog-menu";
import NavbarShell from "./NavbarShell";

export default async function Navbar() {
  const [user, categoriesResult, settings, productCounts, categoryPreviews] =
    await Promise.all([
      getCurrentUser(),
      getCachedCategories({ isActive: true, sort: "order" }),
      getCachedSettings(),
      // Меню каталога: те же счётчики, что у витрины каталога (одна запись
      // кэша на двоих), и по нескольку товаров на раздел для превью.
      getCachedCategoryProductCounts(),
      getCachedCategoryPreviews(),
    ]);

  const [
    cartItemCount,
    cartProductIds,
    wishlistProductIds,
    unreadNotificationCount,
  ] = user
    ? await Promise.all([
        getCartItemCount(String(user.id)),
        getCartProductIds(String(user.id)),
        getWishlistProductIds(String(user.id)),
        getUnreadNotificationCount(user.id),
      ])
    : [0, [] as string[], [] as string[], 0];

  const categories = categoriesResult?.docs || [];
  const catalogMenu = buildCatalogMenu(
    categories,
    productCounts,
    categoryPreviews,
  );

  return (
    <NavbarShell
      user={user}
      categories={categories}
      catalogMenu={catalogMenu}
      settings={settings}
      cartItemCount={cartItemCount}
      cartProductIds={cartProductIds}
      wishlistProductIds={wishlistProductIds}
      unreadNotificationCount={unreadNotificationCount}
      cartOnboardingSeen={Boolean(user?.cartOnboardingSeenAt)}
    />
  );
}
