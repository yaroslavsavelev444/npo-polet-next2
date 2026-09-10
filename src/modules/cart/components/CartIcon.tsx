// src/modules/cart/components/CartIcon.tsx
"use client";

import { ShoppingCart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/shared/store/cart.store";
import { useCartItemsStore } from "@/shared/store/cartItems.store";
import { cn } from "@/utils/cn";
import { useCartPanel } from "../store/cart-panel.store";

interface CartIconProps {
	initialCount: number;
	initialProductIds: string[];
	/**
	 * Гостю корзина показывается ровно так же и работает так же: состав живёт
	 * локально, а после входа переносится в аккаунт (см. CartProvider). Прятать
	 * иконку от неавторизованного означало бы прятать саму возможность покупки —
	 * посетитель не видит корзины и не понимает, что она вообще есть.
	 */
	isAuthenticated?: boolean;
	className?: string;
}

/**
 * Значок корзины в шапке. Теперь это КНОПКА, а не ссылка: корзина открывается
 * поверх текущей страницы, и уводить с неё нельзя — иначе выбор товара
 * прерывается переходом ровно в тот момент, когда его продолжают.
 *
 * Страница /cart при этом никуда не делась: она остаётся по прямой ссылке и
 * тем, кто хочет разобрать большой заказ на всю ширину экрана.
 */
export function CartIcon({
	initialCount,
	initialProductIds,
	isAuthenticated = true,
	className,
}: CartIconProps) {
	const itemCount = useCartStore((s) => s.itemCount);
	const hydrate = useCartStore((s) => s.hydrate);
	const hydrateItems = useCartItemsStore((s) => s.hydrate);
	const open = useCartPanel((s) => s.open);

	useEffect(() => {
		if (!isAuthenticated) return;
		hydrate(initialCount);
	}, [initialCount, hydrate, isAuthenticated]);

	useEffect(() => {
		if (!isAuthenticated) return;
		hydrateItems(initialProductIds);
	}, [initialProductIds, hydrateItems, isAuthenticated]);

	// Бейдж коротко «клюёт» при росте числа — единственное подтверждение
	// добавления, видимое, когда панель не открывается. Считаем именно рост:
	// на удалении подпрыгивать нечему.
	const [bumped, setBumped] = useState(false);
	const previousCount = useRef(itemCount);
	useEffect(() => {
		if (itemCount > previousCount.current) {
			setBumped(true);
			const timeout = setTimeout(() => setBumped(false), 420);
			previousCount.current = itemCount;
			return () => clearTimeout(timeout);
		}
		previousCount.current = itemCount;
	}, [itemCount]);

	const showBadge = itemCount > 0;

	return (
		<button
			type="button"
			onClick={() => open("user")}
			aria-label={
				showBadge ? `Корзина, товаров: ${itemCount}` : "Корзина, пусто"
			}
			aria-haspopup="dialog"
			className={cn(
				"relative flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10",
				className,
			)}
		>
			<ShoppingCart size={18} aria-hidden />
			{showBadge && (
				<span
					aria-hidden
					className={cn(
						"absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-semibold leading-none text-white tabular-nums",
						"transition-transform duration-200 ease-out motion-reduce:transition-none",
						bumped && "scale-125",
					)}
				>
					{itemCount > 99 ? "99+" : itemCount}
				</span>
			)}
		</button>
	);
}
