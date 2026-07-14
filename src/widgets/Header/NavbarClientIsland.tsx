"use client";

import { Flex } from "@once-ui-system/core";
import { useState } from "react";
import { CartIcon } from "@/modules/cart/components/CartIcon";
import { NotificationBell } from "@/modules/notifications";
import { WishlistIcon } from "@/modules/wishlist";
import type { Category, Setting, User } from "@/payload-types";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import NavMenus from "./NavMenus";
import SearchInput from "./SearchInput";
import UserMenu from "./UserMenu";

interface Props {
  user: User | null;
  categories: Category[];
  settings: Setting | null;
  cartItemCount: number;
  cartProductIds: string[];
  wishlistProductIds: string[];
  unreadNotificationCount: number;
}

export default function NavbarClientIsland({
  user,
  categories,
  settings,
  cartItemCount,
  cartProductIds,
  wishlistProductIds,
  unreadNotificationCount,
}: Props) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      <Flex fillWidth vertical="center" horizontal="between" gap="16">
        {/* LEFT */}
        <Logo settings={settings} />

        {/* CENTER - Desktop Search. !-модификатор обязателен: базовые стили
            @once-ui-system/core грузятся раньше Tailwind (см. layout.tsx) и
            задают этому Flex display:flex с более высоким приоритетом, чем
            у обычного Tailwind-класса `hidden` — без !important поиск не
            скрывался на мобильных и выталкивал иконки (в т.ч. колокольчик)
            за пределы экрана. */}
        <Flex flex={1} horizontal="center" className="!hidden md:!flex">
          <SearchInput expanded />
        </Flex>

        {/* RIGHT */}
        <Flex vertical="center" gap="12" className="flex-shrink-0">
          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            <NavMenus categories={categories} />
          </div>
          {user && <WishlistIcon initialProductIds={wishlistProductIds} />}
          {user && <CartIcon initialCount={cartItemCount} initialProductIds={cartProductIds} />}
          {user && <NotificationBell initialUnreadCount={unreadNotificationCount} />}
          <UserMenu user={user} />

          {/* Burger */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="lg:hidden p-2 text-white"
            aria-label="Toggle menu"
          >
            {isMobileOpen ? "✕" : "☰"}
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
