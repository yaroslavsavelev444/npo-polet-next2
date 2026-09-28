"use client";

/**
 * «Сообщить о поступлении» для одного товара.
 *
 * Повторяет устройство useToggleWishlist: мгновенное оптимистичное
 * переключение, серверное действие, откат при ошибке, окно входа поверх
 * страницы с повтором действия после входа. Отличие — действие передаёт
 * ЖЕЛАЕМОЕ состояние, а не «переключить»: двойной клик и повтор после сбоя
 * сети дают один и тот же результат.
 */

import { useCallback, useEffect, useState } from "react";
import { openAuthOverlay } from "@/modules/auth/store/auth-overlay.store";
import { setRestockSubscriptionAction } from "@/modules/restock/actions/restock.actions";
import { resetRestockStore, useRestockStore } from "@/modules/restock/store";
import { appToast } from "@/shared/lib/toast";

export interface UseRestockSubscriptionResult {
	isSubscribed: boolean;
	isPending: boolean;
	toggle: () => Promise<void>;
}

export function useRestockSubscription(
	productId: string,
	productTitle: string,
): UseRestockSubscriptionResult {
	const [isPending, setIsPending] = useState(false);
	const isSubscribed = useRestockStore((s) => s.productIds.has(productId));
	const setSubscribed = useRestockStore((s) => s.set);
	const load = useRestockStore((s) => s.load);

	useEffect(() => {
		void load();
	}, [load]);

	const toggle = useCallback(async () => {
		const next = !isSubscribed;
		setIsPending(true);
		setSubscribed(productId, next);

		try {
			const result = await setRestockSubscriptionAction(productId, next);

			if (result.success) {
				setSubscribed(productId, result.data.subscribed);
				if (result.data.subscribed) {
					appToast.success(
						`Сообщим о поступлении «${productTitle}» — уведомление появится в колокольчике`,
					);
				} else {
					appToast.info(`Больше не ждём «${productTitle}»`);
				}
				return;
			}

			setSubscribed(productId, !next);

			if (result.error === "AUTH_REQUIRED") {
				openAuthOverlay({
					reason:
						"Уведомление о поступлении приходит в аккаунт. Войдите — подписка оформится сразу после этого.",
					onSuccess: async () => {
						const retry = await setRestockSubscriptionAction(productId, true);
						// Вошёл другой пользователь — список его подписок другой.
						resetRestockStore();
						await useRestockStore.getState().load();
						if (retry.success) {
							useRestockStore.getState().set(productId, true);
							appToast.success(
								`Сообщим о поступлении «${productTitle}» — уведомление появится в колокольчике`,
							);
						} else {
							appToast.warning(retry.message);
						}
					},
				});
				return;
			}

			appToast.warning(result.message);
		} catch {
			setSubscribed(productId, !next);
			appToast.warning("Не удалось сохранить. Попробуйте ещё раз.");
		} finally {
			setIsPending(false);
		}
	}, [isSubscribed, productId, productTitle, setSubscribed]);

	return { isSubscribed, isPending, toggle };
}
