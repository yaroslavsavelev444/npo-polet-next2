'use client';

import { Flex } from '@once-ui-system/core';
import { useState } from 'react';
import Logo from './Logo';
import SearchInput from './SearchInput';
import NavMenus from './NavMenus';
import UserMenu from './UserMenu';
import MobileMenu from './MobileMenu';
import type { Category, Setting } from '@/payload-types';
import type { User } from '@/payload-types';
import { CartIcon } from '@/modules/cart/components/CartIcon'


interface Props {
  user: User | null;
  categories: Category[];
  settings: Setting | null;
  cartItemCount: number;
}

export default function NavbarClientIsland({ user, categories, settings, cartItemCount }: Props) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      <Flex fillWidth vertical="center" horizontal="between" gap="16">
        {/* LEFT */}
        <Logo settings={settings} />

        {/* CENTER - Desktop Search */}
        <Flex flex={1} horizontal="center" className="hidden md:flex">
          <SearchInput expanded />
        </Flex>

        {/* RIGHT */}
        <Flex vertical="center" gap="12" className="flex-shrink-0">
          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            <NavMenus categories={categories} />
          </div>
{user && <CartIcon initialCount={cartItemCount} />}
          <UserMenu user={user} />

          {/* Burger */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="lg:hidden p-2 text-white"
            aria-label="Toggle menu"
          >
            {isMobileOpen ? '✕' : '☰'}
          </button>
        </Flex>
      </Flex>

      <MobileMenu
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        user={user}
        categories={categories}
      />
    </>
  );
}