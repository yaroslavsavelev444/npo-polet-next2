import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser';
import { getCachedCategories } from '@/payload/services/categories.service';
import { getCachedSettings } from '@/payload/services/settings.service';
import { getCartItemCount } from '@/payload/services/carts.service';
import { getWishlistProductIds } from '@/payload/services/wishlists.service';
import NavbarShell from './NavbarShell';

export default async function Navbar() {
  const [user, categoriesResult, settings] = await Promise.all([
    getCurrentUser(),
    getCachedCategories({ isActive: true, sort: 'order' }),
    getCachedSettings(),
  ]);

  const [cartItemCount, wishlistProductIds] = user
    ? await Promise.all([
        getCartItemCount(String(user.id)),
        getWishlistProductIds(String(user.id)),
      ])
    : [0, [] as string[]];

  const categories = categoriesResult?.docs || [];

  return (
    <NavbarShell
      user={user}
      categories={categories}
      settings={settings}
      cartItemCount={cartItemCount}
      wishlistProductIds={wishlistProductIds}
    />
  );
}