"use client";

import { useEffect, useRef } from "react";
import type { ProductCardData } from "@/modules/productCard";
import { toEcommerceProduct, trackEcommerce } from "../ecommerce";
import {
	getProductViewUrl,
	PRODUCT_VIEW_WINDOW_MS,
} from "../lib/product-views";

const STORAGE_KEY = "polet:product-views";

/**
 * Просмотр карточки товара — два независимых учёта из одного места.
 *
 *  • `detail` в Метрику — на каждое открытие страницы, как и хит самой
 *    страницы (MetrikaPageViews): сессии и повторы Метрика считает сама.
 *    Гасится только технический повтор — второй прогон эффекта в StrictMode
 *    и перерисовка без смены товара.
 *  • +1 к analytics.viewsCount — не чаще раза в PRODUCT_VIEW_WINDOW_MS на
 *    товар в этом браузере. Отметки в localStorage, а не sessionStorage: та
 *    же карточка во второй вкладке — не новый просмотр. Окно повторено на
 *    сервере, здесь оно только избавляет от лишних запросов.
 *
 * Согласие на аналитические cookie проверяет только первый учёт (внутри
 * trackEcommerce). Второй — обезличенный счётчик товара: ни cookie, ни
 * идентификатора посетителя наружу не уходит, отметки остаются в браузере.
 *
 * Эффект, а не запись при рендере: Server Component рендерится и для
 * краулеров, и для prefetch, и при router.refresh().
 */
export function ProductViewTracker({ product }: { product: ProductCardData }) {
	const trackedId = useRef<string | null>(null);

	useEffect(() => {
		if (trackedId.current === product.id) return;
		trackedId.current = product.id;

		trackEcommerce("detail", [toEcommerceProduct(product)]);
		if (claimView(product.id)) sendView(product.id);
	}, [product]);

	return null;
}

/** Память на случай недоступного localStorage (приватный режим, запрет). */
const claimedInMemory = new Map<string, number>();

/** true — просмотр в окне ещё не засчитан, и отметка о нём уже поставлена. */
function claimView(productId: string): boolean {
	const now = Date.now();
	const isFresh = (at: number | undefined) =>
		typeof at === "number" && now - at < PRODUCT_VIEW_WINDOW_MS;

	if (isFresh(claimedInMemory.get(productId))) return false;
	claimedInMemory.set(productId, now);

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const stored: Record<string, number> = raw ? JSON.parse(raw) : {};
		if (isFresh(stored[productId])) return false;

		// Заодно выбрасываем истёкшие отметки — иначе запись росла бы с каждым
		// когда-либо открытым товаром.
		const next: Record<string, number> = { [productId]: now };
		for (const [id, at] of Object.entries(stored)) {
			if (id !== productId && isFresh(at)) next[id] = at;
		}
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Хранилище недоступно или испорчено — хватит памяти вкладки.
	}
	return true;
}

function sendView(productId: string): void {
	const url = getProductViewUrl(productId);
	try {
		// sendBeacon переживает уход со страницы и не занимает очередь запросов.
		if (navigator.sendBeacon?.(url)) return;
	} catch {
		// Падаем на fetch ниже.
	}
	void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
}
