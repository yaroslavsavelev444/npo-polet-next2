"use client";

import { Flex } from "@once-ui-system/core";
import { Menu, X } from "lucide-react";
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
					{user && (
						<CartIcon
							initialCount={cartItemCount}
							initialProductIds={cartProductIds}
						/>
					)}
					{user && (
						<NotificationBell initialUnreadCount={unreadNotificationCount} />
					)}
					<UserMenu user={user} />

					{/* Burger */}
					<button
						type="button"
						onClick={() => setIsMobileOpen((prev) => !prev)}
						className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 lg:hidden"
						aria-label={isMobileOpen ? "Закрыть меню" : "Открыть меню"}
						aria-expanded={isMobileOpen}
					>
						{isMobileOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
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
