"use client";

/**
 * modules/productCard/hooks/useRemoveFromCart.ts
 *
 * Удаление товара из корзины кнопкой «В корзине → Убрать» в каталоге.
 *
 * Как и useAddToCart, работает через стор корзины: оптимистичное снятие
 * отметки, откат при отказе и синхронизация счётчика живут там в одном месте.
 * Дублировать их здесь значило бы держать вторую копию тех же правил — и
 * первым же расхождением стала бы открытая панель, не заметившая удаления из
 * каталога.
 */

import { useCallback, useState } from "react";
import { useCartPanel } from "@/modules/cart/store/cart-panel.store";
import { appToast } from "@/shared/lib/toast";

export interface UseRemoveFromCartResult {
	isRemoving: boolean;
	removeFromCart: (productId: string, productTitle: string) => Promise<void>;
}

export function useRemoveFromCart(): UseRemoveFromCartResult {
	const [isRemoving, setIsRemoving] = useState(false);
	const remove = useCartPanel((s) => s.remove);

	const removeFromCart = useCallback(
		async (productId: string, productTitle: string) => {
			setIsRemoving(true);
			try {
				const result = await remove(productId);

				if (!result.ok) {
					appToast.warning(
						result.message ?? "Не удалось убрать товар из корзины",
					);
					return;
				}

				// При открытой панели строка уходит на глазах — тост поверх неё
				// сообщил бы то же самое второй раз.
				if (useCartPanel.getState().isOpen) return;

				appToast.success(`«${productTitle}» убран из корзины`);
			} finally {
				setIsRemoving(false);
			}
		},
		[remove],
	);

	return { isRemoving, removeFromCart };
}
