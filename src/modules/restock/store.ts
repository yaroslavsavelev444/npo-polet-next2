"use client";

import { create } from "zustand";
import { getRestockSubscriptionsAction } from "./actions/restock.actions";

/**
 * На какие товары подписан текущий пользователь («Сообщить о поступлении»).
 *
 * В отличие от избранного, список не приходит с каждой страницей из шапки:
 * он нужен только там, где показан недоступный товар, а таких страниц
 * меньшинство. Поэтому загрузка ленивая — первая кнопка подписки на странице
 * вызывает load(), остальные получают тот же промис.
 */
interface RestockStoreState {
	productIds: Set<string>;
	status: "idle" | "loading" | "ready";
	load: () => Promise<void>;
	set: (productId: string, subscribed: boolean) => void;
}

let loading: Promise<void> | null = null;

export const useRestockStore = create<RestockStoreState>((set, get) => ({
	productIds: new Set(),
	status: "idle",

	load: () => {
		if (get().status === "ready") return Promise.resolve();
		if (!loading) {
			set({ status: "loading" });
			loading = getRestockSubscriptionsAction()
				.then((state) => {
					set({ productIds: new Set(state.productIds), status: "ready" });
				})
				.catch(() => {
					// Не удалось узнать — показываем исходное состояние; нажатие
					// всё равно идемпотентно.
					set({ status: "ready" });
				})
				.finally(() => {
					loading = null;
				});
		}
		return loading;
	},

	set: (productId, subscribed) =>
		set((state) => {
			if (state.productIds.has(productId) === subscribed) return state;
			const next = new Set(state.productIds);
			if (subscribed) next.add(productId);
			else next.delete(productId);
			return { productIds: next };
		}),
}));

/** Сброс при смене пользователя (вход/выход). */
export function resetRestockStore(): void {
	loading = null;
	useRestockStore.setState({ productIds: new Set(), status: "idle" });
}
