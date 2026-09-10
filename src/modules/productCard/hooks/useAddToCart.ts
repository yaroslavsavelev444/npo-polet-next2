// src/modules/productCard/hooks/useAddToCart.ts
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useCartPanel } from "@/modules/cart/store/cart-panel.store";
import { appToast } from "@/shared/lib/toast";
import type { ProductCardData } from "../types";

export interface UseAddToCartResult {
	isAdding: boolean;
	addToCart: (product: ProductCardData, quantity: number) => Promise<void>;
}

/**
 * Добавление товара в корзину из карточки, страницы товара и липкой панели.
 *
 * Хук больше не ходит в Server Action напрямую и не правит счётчик руками:
 * и то и другое делает стор корзины (modules/cart/store/cart-panel.store).
 * Иначе состояний корзины стало бы два — одно в панели, другое здесь, — и
 * добавление из каталога не доезжало бы до открытой панели.
 *
 * Тост показывается НЕ всегда. При первом в жизни аккаунта добавлении панель
 * открывается сама с объяснением, а при добавлении с уже открытой панелью
 * новая строка появляется прямо на глазах — в обоих случаях всплывающее
 * сообщение было бы вторым уведомлением об одном и том же событии, да ещё и
 * поверх той самой панели, которая обо всём уже сказала.
 */
export function useAddToCart(): UseAddToCartResult {
	const router = useRouter();
	const pathname = usePathname();
	const [isAdding, setIsAdding] = useState(false);
	const add = useCartPanel((s) => s.add);

	const addToCart = useCallback(
		async (product: ProductCardData, quantity: number) => {
			setIsAdding(true);
			try {
				const outcome = await add(product, quantity);

				if (!outcome.ok) {
					if (outcome.reason === "auth") {
						// Сессия истекла посреди работы: возвращаем туда же, где человек
						// был, а не на страницу корзины — он выбирал товар, а не смотрел
						// корзину.
						appToast.warning("Сессия истекла — войдите, чтобы продолжить");
						router.push(`/auth/login?from=${encodeURIComponent(pathname)}`);
						return;
					}
					appToast.warning(outcome.message);
					return;
				}

				if (outcome.opened) return;
				if (useCartPanel.getState().isOpen) return;

				appToast.success(
					quantity > 1
						? `«${product.title}» в корзине — ${quantity} шт.`
						: `«${product.title}» в корзине`,
				);
			} finally {
				setIsAdding(false);
			}
		},
		[add, pathname, router],
	);

	return { isAdding, addToCart };
}
