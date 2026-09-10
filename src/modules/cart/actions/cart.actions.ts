// src/modules/cart/actions/cart.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import type { ProductCardData } from "@/modules/productCard";
import { mapProductToCardData } from "@/modules/productCard";
import {
	clearCartItems,
	getCartByUserId,
	removeCartItem,
	setCartItemQuantity,
	setCartItems,
} from "@/payload/services/carts.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import {
	getCachedProductById,
	getCachedProducts,
} from "@/payload/services/products.service";
import {
	buildCartView,
	buildCartViewFromEntries,
	EMPTY_CART_VIEW,
} from "../lib/build-cart-view";
import type {
	CartActionErrorCode,
	CartActionResult,
	CartEntry,
	CartMergeResult,
	CartUnavailableItem,
} from "../types";

async function requireUser() {
	return getCurrentUser();
}

function failure(
	error: CartActionErrorCode,
	message: string,
): CartActionResult {
	return { success: false, error, message };
}

// Верхняя граница на позицию в корзине. Ниже по потоку количество умножается
// на цену и попадает в заказ, поэтому дробное/огромное/NaN значение из клиента
// не должно доходить до БД: клиентский <input type="number"> ничего не
// гарантирует, а Server Action вызывается и напрямую.
const MAX_ITEM_QUANTITY = 1000;

/**
 * Верхняя граница на число ПОЗИЦИЙ в гостевой корзине. Гостевой список
 * приходит из localStorage, то есть полностью под контролем клиента: без
 * этого предела один запрос мог бы попросить расчёт по десяткам тысяч
 * товаров. Для настоящей корзины такого предела нет — её состав пишем мы
 * сами, позиция за позицией.
 */
const MAX_GUEST_ENTRIES = 50;

function normalizeQuantity(quantity: number): number | null {
	if (!Number.isSafeInteger(quantity)) return null;
	if (quantity > MAX_ITEM_QUANTITY) return null;
	return quantity;
}

/** Идентификатор товара в этой схеме — числовой id Payload. */
function normalizeProductId(productId: string): string | null {
	const numeric = Number(productId);
	if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
	return String(numeric);
}

/**
 * Приводит присланный клиентом список к тому, с чем безопасно работать:
 * валидные id, целые количества в диапазоне, без дублей и не длиннее предела.
 * Единственная точка входа гостевых данных на сервер — и расчёт цен, и
 * слияние после входа проходят через неё.
 */
function normalizeEntries(entries: CartEntry[]): CartEntry[] {
	if (!Array.isArray(entries)) return [];

	const byProduct = new Map<string, CartEntry>();

	for (const entry of entries) {
		const id = normalizeProductId(String(entry?.productId ?? ""));
		const quantity = normalizeQuantity(Number(entry?.quantity));
		if (!id || quantity === null || quantity < 1) continue;

		// Дубли складываем, а не берём последний: список пришёл из localStorage и
		// теоретически мог накопить две строки одного товара (две вкладки писали
		// одновременно). Потерять при этом количество нельзя.
		const existing = byProduct.get(id);
		const merged = Math.min(
			(existing?.quantity ?? 0) + quantity,
			MAX_ITEM_QUANTITY,
		);
		byProduct.set(id, {
			productId: id,
			quantity: merged,
			addedAt: entry?.addedAt ?? existing?.addedAt ?? null,
		});

		if (byProduct.size >= MAX_GUEST_ENTRIES) break;
	}

	return [...byProduct.values()];
}

async function successForUser(userId: string): Promise<CartActionResult> {
	const cart = await getCartByUserId(userId);
	return { success: true, data: await buildCartView(cart) };
}

export async function addToCartAction(
	productId: string,
	quantity = 1,
): Promise<CartActionResult> {
	const user = await requireUser();
	if (!user)
		return failure(
			"AUTH_REQUIRED",
			"Войдите в аккаунт, чтобы добавить товар в корзину",
		);

	const id = normalizeProductId(productId);
	const amount = normalizeQuantity(quantity);
	if (!id || amount === null || amount < 1) {
		return failure("PRODUCT_UNAVAILABLE", "Некорректное количество товара");
	}
	productId = id;
	quantity = amount;

	const product = await getCachedProductById(productId);
	const status = product?.inventory?.status ?? "available";
	if (
		!product ||
		!product.inventory?.isVisible ||
		!["available", "preorder"].includes(status)
	) {
		return failure("PRODUCT_UNAVAILABLE", "Товар недоступен для заказа");
	}

	const existingCart = await getCartByUserId(String(user.id));
	const existingItem = existingCart?.items?.find(
		(i) =>
			String(typeof i.product === "object" ? i.product.id : i.product) ===
			String(productId),
	);
	const nextQuantity = (existingItem?.quantity ?? 0) + quantity;

	// Накопительная граница: без неё повторные добавления обходили бы
	// MAX_ITEM_QUANTITY, когда у товара не задан свой maxOrderQuantity.
	if (nextQuantity > MAX_ITEM_QUANTITY) {
		return failure(
			"MAX_QUANTITY_EXCEEDED",
			`Максимальное количество для заказа: ${MAX_ITEM_QUANTITY} шт.`,
		);
	}

	const maxOrderQuantity = product.inventory?.maxOrderQuantity;
	if (maxOrderQuantity && nextQuantity > maxOrderQuantity) {
		return failure(
			"MAX_QUANTITY_EXCEEDED",
			`Максимальное количество для заказа: ${maxOrderQuantity} шт.`,
		);
	}

	// Reuse the cart we already fetched above instead of fetching it again inside the service.
	await setCartItemQuantity(
		String(user.id),
		productId,
		nextQuantity,
		existingCart ?? undefined,
	);
	revalidatePath("/cart");
	return successForUser(String(user.id));
}

export async function updateCartItemQuantityAction(
	productId: string,
	quantity: number,
): Promise<CartActionResult> {
	const user = await requireUser();
	if (!user) return failure("AUTH_REQUIRED", "Войдите в аккаунт");

	const id = normalizeProductId(productId);
	const amount = normalizeQuantity(quantity);
	if (!id || amount === null) {
		return failure("PRODUCT_UNAVAILABLE", "Некорректное количество товара");
	}
	productId = id;
	quantity = amount;

	if (quantity < 1) {
		return removeFromCartAction(productId);
	}

	const product = await getCachedProductById(productId);
	const maxOrderQuantity = product?.inventory?.maxOrderQuantity;
	if (maxOrderQuantity && quantity > maxOrderQuantity) {
		return failure(
			"MAX_QUANTITY_EXCEEDED",
			`Максимальное количество для заказа: ${maxOrderQuantity} шт.`,
		);
	}

	await setCartItemQuantity(String(user.id), productId, quantity);
	revalidatePath("/cart");
	return successForUser(String(user.id));
}

export async function removeFromCartAction(
	productId: string,
): Promise<CartActionResult> {
	const user = await requireUser();
	if (!user) return failure("AUTH_REQUIRED", "Войдите в аккаунт");

	const id = normalizeProductId(productId);
	if (!id) return failure("PRODUCT_UNAVAILABLE", "Товар не найден");

	await removeCartItem(String(user.id), id);
	revalidatePath("/cart");
	return successForUser(String(user.id));
}

export async function clearCartAction(): Promise<CartActionResult> {
	const user = await requireUser();
	if (!user) return failure("AUTH_REQUIRED", "Войдите в аккаунт");

	await clearCartItems(String(user.id));
	revalidatePath("/cart");
	return successForUser(String(user.id));
}

export async function getCartViewAction(): Promise<CartActionResult> {
	const user = await requireUser();
	if (!user) return { success: true, data: EMPTY_CART_VIEW };
	return successForUser(String(user.id));
}

/* ==========================================================================
   Гостевая корзина
   ========================================================================== */

/**
 * Считает корзину гостя. Состав приходит с клиента, ЦЕНЫ считаются здесь —
 * клиент не хранит и не присылает ни одной суммы, поэтому подделать итог
 * из localStorage невозможно.
 *
 * Действие намеренно не требует авторизации: это чистый расчёт, ничего не
 * пишущий. Вошедшему пользователю оно тоже отвечает — так после входа в
 * соседней вкладке гостевая панель не падает в ошибку, а спокойно
 * дорисовывается до момента слияния.
 */
export async function getGuestCartViewAction(
	entries: CartEntry[],
): Promise<CartActionResult> {
	const normalized = normalizeEntries(entries);
	if (normalized.length === 0) return { success: true, data: EMPTY_CART_VIEW };
	return { success: true, data: await buildCartViewFromEntries(normalized) };
}

/**
 * Переносит гостевую корзину в серверную после входа.
 *
 * Правило слияния для товара, который есть в обеих корзинах, — МАКСИМУМ, а не
 * сумма. Гость видел в панели 2 шт., на сервере с прошлого раза лежало 3:
 * сумма дала бы 5 — количество, которого пользователь не выбирал ни разу.
 * Максимум не теряет ничего из увиденного и ничего не выдумывает.
 *
 * Действие идемпотентно по составу: повторный вызов с тем же списком даёт ту
 * же корзину (максимум уже достигнут). Поэтому повтор после сетевого сбоя
 * безопасен, и клиенту не нужен токен операции.
 */
export async function mergeGuestCartAction(
	entries: CartEntry[],
): Promise<CartMergeResult> {
	const user = await requireUser();
	if (!user) {
		return {
			success: false,
			error: "AUTH_REQUIRED",
			message: "Войдите в аккаунт",
		};
	}

	const normalized = normalizeEntries(entries);
	const userId = String(user.id);

	if (normalized.length === 0) {
		const view = await successForUser(userId);
		return view.success
			? { success: true, data: view.data, skipped: [] }
			: view;
	}

	const { docs } = await getCachedProducts({
		ids: normalized.map((entry) => entry.productId),
		limit: normalized.length,
		depth: 0,
	});
	const byId = new Map(docs.map((product) => [String(product.id), product]));

	const existingCart = await getCartByUserId(userId);
	const serverQuantities = new Map<
		string,
		{ quantity: number; addedAt?: string | null }
	>();
	for (const item of existingCart?.items ?? []) {
		const id = String(
			typeof item.product === "object" ? item.product.id : item.product,
		);
		serverQuantities.set(id, {
			quantity: item.quantity,
			addedAt: item.addedAt,
		});
	}

	const skipped: CartUnavailableItem[] = [];
	const merged = new Map(serverQuantities);

	for (const entry of normalized) {
		const product = byId.get(entry.productId);

		if (!product) {
			skipped.push({ productId: entry.productId, title: null, reason: "gone" });
			continue;
		}

		const status = product.inventory?.status ?? "available";
		if (
			!product.inventory?.isVisible ||
			!["available", "preorder"].includes(status)
		) {
			skipped.push({
				productId: entry.productId,
				title: product.title,
				reason: "unavailable",
			});
			continue;
		}

		const ceiling = Math.min(
			product.inventory?.maxOrderQuantity || MAX_ITEM_QUANTITY,
			MAX_ITEM_QUANTITY,
		);
		const serverQuantity = serverQuantities.get(entry.productId)?.quantity ?? 0;
		const quantity = Math.min(
			Math.max(entry.quantity, serverQuantity),
			ceiling,
		);

		merged.set(entry.productId, {
			quantity,
			// Порядок в корзине — по времени добавления; для перенесённой позиции
			// сохраняем более раннюю из двух отметок, чтобы товар не «всплыл»
			// наверх только оттого, что пользователь вошёл в аккаунт.
			addedAt: earliest(
				serverQuantities.get(entry.productId)?.addedAt,
				entry.addedAt,
			),
		});
	}

	await setCartItems(
		userId,
		[...merged.entries()].map(([productId, value]) => ({
			productId,
			quantity: value.quantity,
			addedAt: value.addedAt,
		})),
		existingCart ?? undefined,
	);
	revalidatePath("/cart");

	const view = await successForUser(userId);
	return view.success ? { success: true, data: view.data, skipped } : view;
}

function earliest(a?: string | null, b?: string | null): string {
	const dates = [a, b].filter(Boolean) as string[];
	if (dates.length === 0) return new Date().toISOString();
	return dates.sort()[0];
}

/* ==========================================================================
   Первое знакомство с корзиной
   ========================================================================== */

/**
 * Отмечает, что пользователь увидел объяснение про корзину.
 *
 * Отметка живёт в профиле, а не в localStorage: подсказка привязана к
 * АККАУНТУ, и человек, вошедший с другого устройства или из другого браузера,
 * не должен встречать её заново. Клиент дополнительно помнит факт локально —
 * но только как страховку на случай, если эта запись не прошла (см.
 * cart-onboarding.ts).
 */
export async function markCartOnboardingSeenAction(): Promise<{
	success: boolean;
}> {
	const user = await requireUser();
	if (!user) return { success: false };

	// Повторная отметка ничего не меняет — не пишем.
	if (user.cartOnboardingSeenAt) return { success: true };

	try {
		const payload = await getPayloadInstance();
		await payload.update({
			collection: "users",
			id: user.id,
			data: { cartOnboardingSeenAt: new Date().toISOString() },
			overrideAccess: true,
		});
		return { success: true };
	} catch {
		return { success: false };
	}
}

/* ==========================================================================
   Рекомендации для пустой корзины
   ========================================================================== */

const RECOMMENDATIONS_LIMIT = 4;

/**
 * Товары для пустой корзины. Берём тот же список, что и витрина главной
 * (`showOnMainPage`), — отдельного механизма подбора в проекте нет, и
 * заводить его ради панели корзины значило бы придумывать вторую редакционную
 * политику там, где уже есть одна.
 *
 * Загружается только когда пустую панель действительно открыли: на страницах,
 * где до корзины не дошли, это не стоит ничего.
 */
export async function getCartRecommendationsAction(): Promise<
	ProductCardData[]
> {
	try {
		const { docs } = await getCachedProducts({
			showOnMainPage: true,
			isVisible: true,
			status: "available",
			limit: RECOMMENDATIONS_LIMIT,
			depth: 1,
		});
		return docs.map((product) => mapProductToCardData(product));
	} catch {
		return [];
	}
}
