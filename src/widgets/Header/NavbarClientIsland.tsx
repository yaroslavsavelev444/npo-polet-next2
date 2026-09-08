"use client";

import { Flex } from "@once-ui-system/core";
import { useEffect, useRef, useState } from "react";
import { CartIcon } from "@/modules/cart/components/CartIcon";
import { NotificationBell } from "@/modules/notifications";
import { WishlistIcon } from "@/modules/wishlist";
import type { Category, Setting, User } from "@/payload-types";
import { BurgerButton } from "./BurgerButton";
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

const MOBILE_MENU_ID = "mobile-nav-panel";

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
	const burgerRef = useRef<HTMLButtonElement>(null);

	// На lg бургер исчезает вместе с мобильной вёрсткой. Если ширина
	// перевалила за порог при открытом меню (поворот планшета, изменение
	// размера окна), закрыть его станет нечем — кнопки больше нет. Поэтому
	// переход через границу закрывает панель сам.
	useEffect(() => {
		if (!isMobileOpen) return;
		const query = window.matchMedia("(min-width: 1024px)");
		if (query.matches) {
			setIsMobileOpen(false);
			return;
		}
		const onChange = (event: MediaQueryListEvent) => {
			if (event.matches) setIsMobileOpen(false);
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [isMobileOpen]);

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
					{/* Корзина на desktop остаётся ровно там, где была. На мобильных
					    она рисуется вторым экземпляром — вплотную к бургеру (ниже),
					    потому что там это последнее, до чего дотягивается большой
					    палец. Два экземпляра дешевле, чем условная перестановка
					    порядка: desktop-раскладку тогда пришлось бы менять. */}
					{user && (
						<div className="hidden lg:flex">
							<CartIcon
								initialCount={cartItemCount}
								initialProductIds={cartProductIds}
							/>
						</div>
					)}
					{user && (
						<NotificationBell initialUnreadCount={unreadNotificationCount} />
					)}
					<UserMenu user={user} />

					{/* Mobile: корзина рядом с бургером. Показывается и гостю —
					    переход уводит на вход с возвратом на /cart. */}
					<div className="flex lg:hidden">
						<CartIcon
							initialCount={cartItemCount}
							initialProductIds={cartProductIds}
							isAuthenticated={Boolean(user)}
						/>
					</div>

					<BurgerButton
						ref={burgerRef}
						isOpen={isMobileOpen}
						onClick={() => setIsMobileOpen((prev) => !prev)}
						controls={MOBILE_MENU_ID}
					/>
				</Flex>
			</Flex>

			<MobileMenu
				panelId={MOBILE_MENU_ID}
				triggerRef={burgerRef}
				isOpen={isMobileOpen}
				onClose={() => setIsMobileOpen(false)}
				user={user}
				categories={categories}
				settings={settings}
				cartItemCount={cartItemCount}
			/>
		</>
	);
}
