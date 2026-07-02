// src/widgets/Header/Navbar.tsx
import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser';
import { getCachedCategories } from '@/payload/services/categories.service';
import { getCachedSettings } from '@/payload/services/settings.service';
import { getCartItemCount } from '@/payload/services/carts.service';
import NavbarShell from './NavbarShell';

export default async function Navbar() {
  const [user, categoriesResult, settings] = await Promise.all([
    getCurrentUser(),
    getCachedCategories({ isActive: true, sort: 'order' }),
    getCachedSettings(),
  ]);

  const cartItemCount = user ? await getCartItemCount(String(user.id)) : 0;
  const categories = categoriesResult?.docs || [];

  return (
    <NavbarShell
      user={user}
      categories={categories}
      settings={settings}
      cartItemCount={cartItemCount}
    />
  );
}