// src/modules/cart/components/CartIcon.tsx
"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useCartStore } from "@/shared/store/cart.store";
import { useCartItemsStore } from "@/shared/store/cartItems.store";
import { cn } from "@/utils/cn";

interface CartIconProps {
	initialCount: number;
	initialProductIds: string[];
	/**
	 * Гостю корзина тоже показывается, но ведёт на вход с возвратом на /cart —
	 * ровно тем же путём, которым его развернула бы сама страница корзины
	 * (см. app/(frontend)/cart/page.tsx). Прятать иконку от неавторизованного
	 * означало бы прятать и саму возможность покупки: посетитель не видит
	 * корзины и не понимает, что она вообще есть.
	 */
	isAuthenticated?: boolean;
	className?: string;
}

export function CartIcon({
	initialCount,
	initialProductIds,
	isAuthenticated = true,
	className,
}: CartIconProps) {
	const itemCount = useCartStore((s) => s.itemCount);
	const hydrate = useCartStore((s) => s.hydrate);
	const hydrateItems = useCartItemsStore((s) => s.hydrate);

	useEffect(() => {
		if (!isAuthenticated) return;
		hydrate(initialCount);
	}, [initialCount, hydrate, isAuthenticated]);

	useEffect(() => {
		if (!isAuthenticated) return;
		hydrateItems(initialProductIds);
	}, [initialProductIds, hydrateItems, isAuthenticated]);

	const showBadge = isAuthenticated && itemCount > 0;

	return (
		<Link
			href={isAuthenticated ? "/cart" : "/auth/login?from=/cart"}
			aria-label={isAuthenticated ? "Корзина" : "Корзина — требуется вход"}
			className={cn(
				"relative flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10",
				className,
			)}
		>
			<ShoppingCart size={18} />
			{showBadge && (
				<span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-semibold leading-none text-white">
					{itemCount > 99 ? "99+" : itemCount}
				</span>
			)}
		</Link>
	);
}
