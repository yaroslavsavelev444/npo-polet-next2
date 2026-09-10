"use client";

import { useEffect, useRef } from "react";
import { appToast } from "@/shared/lib/toast";
import { readGuestCart, subscribeToGuestCart } from "../lib/guest-cart-storage";
import {
	mergeGuestCartIntoAccount,
	useCartPanel,
} from "../store/cart-panel.store";
import { CartDrawer } from "./CartDrawer";

interface Props {
	/** id вошедшего покупателя; null — гость. */
	userId: string | null;
	/** Показывали ли уже объяснение про корзину (отметка в профиле). */
	onboardingSeen: boolean;
	categories: { id: string; name: string; slug: string }[];
}

/**
 * Единственная точка подключения корзины к странице.
 *
 * Живёт в шапке (NavbarClientIsland), то есть присутствует на каждой странице
 * витрины. Отсюда — три обязанности, которые больше некому взять:
 *
 *  1. Сообщить стору, кто сейчас в сессии. Шапка рендерится на сервере при
 *     каждом запросе, поэтому вход, выход и смена аккаунта доезжают сюда сами,
 *     без опроса и без собственного «а не сменился ли пользователь».
 *
 *  2. Перенести гостевую корзину в аккаунт сразу после входа — не дожидаясь,
 *     пока человек откроет панель. Иначе товары, добавленные до входа,
 *     существовали бы только в localStorage и пропали бы при первой же
 *     очистке браузера.
 *
 *  3. Держать вкладки согласованными. Гостевая корзина живёт в localStorage,
 *     и правка в соседней вкладке обязана доехать сюда, иначе две вкладки
 *     показывают разные корзины и последняя запись затирает чужую.
 */
export function CartProvider({ userId, onboardingSeen, categories }: Props) {
	const init = useCartPanel((s) => s.init);
	const refresh = useCartPanel((s) => s.refresh);
	const syncGuestFromStorage = useCartPanel((s) => s.syncGuestFromStorage);

	// init обязан отработать ДО первого эффекта, который на него опирается:
	// слияние ниже читает isGuest из стора, и увидеть там прошлую сессию оно
	// не должно. Поэтому — синхронно в теле рендера, один раз на изменение
	// личности, а не в useEffect.
	const lastIdentity = useRef<string | null | undefined>(undefined);
	if (lastIdentity.current !== userId) {
		lastIdentity.current = userId;
		init({ userId, onboardingSeen });
	}

	/* — гость: подтянуть локальную корзину, чтобы счётчик в шапке не врал — */
	useEffect(() => {
		if (userId) return;
		// Пустая локальная корзина не стоит запроса: у большинства гостей она
		// именно такая, и расчёт для пустого списка вернул бы пустой результат.
		if (readGuestCart().length === 0) return;
		void refresh({ silent: true });
	}, [userId, refresh]);

	/* — вход: перенести гостевую корзину в аккаунт ————————————— */
	useEffect(() => {
		if (!userId) return;

		void mergeGuestCartIntoAccount(userId).then(({ merged, skipped }) => {
			if (!merged) return;

			if (skipped.length > 0) {
				const names = skipped
					.map((item) => item.title)
					.filter(Boolean)
					.join(", ");
				appToast.warning(
					names
						? `Корзина перенесена в аккаунт. Не удалось добавить: ${names} — товар больше не продаётся.`
						: "Корзина перенесена в аккаунт. Часть товаров больше не продаётся и не была добавлена.",
				);
				return;
			}

			appToast.success("Корзина перенесена в ваш аккаунт");
		});
	}, [userId]);

	/* — правки из соседних вкладок ————————————————————— */
	useEffect(() => {
		if (userId) return;
		return subscribeToGuestCart(() => syncGuestFromStorage());
	}, [userId, syncGuestFromStorage]);

	/* — возвращение на вкладку ————————————————————————
	   Пользователь мог оформить заказ в другой вкладке, а товар — уйти с
	   продажи, пока эта вкладка лежала в фоне. Показанный состав к этому
	   моменту устарел, поэтому при возвращении он тихо обновляется. Тихо —
	   значит без скелета: подменять уже прочитанное на заглушку хуже, чем
	   на секунду показать прежние данные. */
	useEffect(() => {
		const handle = () => {
			if (document.visibilityState !== "visible") return;
			if (!useCartPanel.getState().view) return;
			void refresh({ silent: true });
		};
		document.addEventListener("visibilitychange", handle);
		return () => document.removeEventListener("visibilitychange", handle);
	}, [refresh]);

	return <CartDrawer categories={categories} />;
}
