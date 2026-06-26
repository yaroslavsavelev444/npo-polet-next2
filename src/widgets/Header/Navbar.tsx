import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser';
import { getCachedCategories } from '@/payload/services/categories.service';
import { getCachedSettings } from '@/payload/services/settings.service';
import NavbarShell from './NavbarShell';

export default async function Navbar() {
  const [user, categoriesResult, settings] = await Promise.all([
    getCurrentUser(),
    getCachedCategories({ isActive: true, sort: 'order' }),
    getCachedSettings(),
  ]);

  const categories = categoriesResult?.docs || [];

  return (
    <NavbarShell
      user={user}
      categories={categories}
      settings={settings}
    />
  );
}