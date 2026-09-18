// src/payload/services/carts.service.ts (append to the existing file)

import type { Cart, Product } from "../../../payload-types";
import { isProductOrderable } from "../utils/product-availability";
import { getPayloadInstance } from "./getPayload";

export async function getCartByUserId(userId: string): Promise<Cart | null> {
  const payload = await getPayloadInstance();
  const { docs } = await payload.find({
    collection: "carts",
    where: { user: { equals: userId } },
    limit: 1,
    depth: 2, // populate items.product AND product.images/category for pricing/UI
    overrideAccess: true,
  });
  return (docs[0] as unknown as Cart) ?? null;
}

export async function getOrCreateCart(userId: string): Promise<Cart> {
  const existing = await getCartByUserId(userId);
  if (existing) return existing;

  const payload = await getPayloadInstance();
  const created = await payload.create({
    collection: "carts",
    data: { user: Number(userId), items: [] },
    overrideAccess: true,
  });
  return created as unknown as Cart;
}

/** id товара позиции; null — связь обнулена, товара в базе больше нет. */
function itemProductId(item: NonNullable<Cart["items"]>[number]): number | null {
  if (item.product == null) return null;
  return typeof item.product === "object" ? item.product.id : item.product;
}

/**
 * Позиции корзины в виде, пригодном для записи обратно.
 *
 * Строки с обнулённой связью ОТБРАСЫВАЮТСЯ. Такая строка получилась бы, если
 * бы товар удалили из базы: внешний ключ объявлен ON DELETE set null. Сегодня
 * до этого не доходит — колонка `carts_items.product_id` объявлена NOT NULL,
 * поэтому Postgres отклоняет само удаление товара, лежащего у кого-то в
 * корзине (администратор видит ошибку 23502). Но если ограничение однажды
 * ослабят, осиротевшая строка не должна ломать корзину целиком: поле
 * `product` в коллекции обязательное, и отправленная как есть такая строка
 * уронила бы ЛЮБУЮ запись — ни количество поправить, ни другую позицию
 * убрать, ни очистить. Восстановить её всё равно нечем (товара нет), поэтому
 * первая же запись её вычищает.
 */
function serializeItems(cart: Cart) {
  return (cart.items ?? []).flatMap((item) => {
    const product = itemProductId(item);
    if (product == null) return [];
    return [
      {
        product,
        quantity: item.quantity,
        addedAt: item.addedAt ?? new Date().toISOString(),
      },
    ];
  });
}

/** Upserts a single line item to an absolute quantity. */
export async function setCartItemQuantity(
  userId: string,
  productId: string,
  quantity: number,
  existingCart?: Cart,
): Promise<Cart> {
  const payload = await getPayloadInstance();
  const cart = existingCart ?? (await getOrCreateCart(userId));
  const items = serializeItems(cart);

  const index = items.findIndex((i) => String(i.product) === String(productId));
  if (index === -1) {
    items.push({
      product: Number(productId),
      quantity,
      addedAt: new Date().toISOString(),
    });
  } else {
    items[index] = {
      ...items[index],
      quantity,
      addedAt: new Date().toISOString(),
    };
  }

  const updated = await payload.update({
    collection: "carts",
    id: cart.id,
    data: { items },
    overrideAccess: true,
  });
  return updated as unknown as Cart;
}

/**
 * Убирает позицию из корзины.
 *
 * `itemId` — обычно числовой id товара. Но у строки, товар которой удалён из
 * базы, связи нет вовсе, и назвать её можно только собственным id строки
 * массива; такие строки корзина показывает с пометкой «товара больше нет в
 * каталоге», и убрать их пользователь тоже должен уметь. Поэтому совпадение
 * проверяется по обоим идентификаторам.
 */
export async function removeCartItem(
  userId: string,
  itemId: string,
): Promise<Cart> {
  const payload = await getPayloadInstance();
  const cart = await getOrCreateCart(userId);

  const kept: Cart = {
    ...cart,
    items: (cart.items ?? []).filter((item) => {
      const product = itemProductId(item);
      if (product != null && String(product) === itemId) return false;
      return String(item.id ?? "") !== itemId;
    }),
  };
  const items = serializeItems(kept);

  const updated = await payload.update({
    collection: "carts",
    id: cart.id,
    data: { items },
    overrideAccess: true,
  });
  return updated as unknown as Cart;
}

/**
 * Записывает состав корзины целиком, одной операцией.
 *
 * Нужно слиянию гостевой корзины: там меняется сразу несколько позиций, и
 * поштучные вызовы setCartItemQuantity дали бы столько же записей в базу —
 * каждая со своим окном, в котором параллельная вкладка успевает записать
 * своё. Один update означает, что корзина после слияния либо целиком новая,
 * либо целиком прежняя.
 */
export async function setCartItems(
  userId: string,
  entries: { productId: string; quantity: number; addedAt?: string | null }[],
  existingCart?: Cart,
): Promise<Cart> {
  const payload = await getPayloadInstance();
  const cart = existingCart ?? (await getOrCreateCart(userId));

  const updated = await payload.update({
    collection: "carts",
    id: cart.id,
    data: {
      items: entries.map((entry) => ({
        product: Number(entry.productId),
        quantity: entry.quantity,
        addedAt: entry.addedAt ?? new Date().toISOString(),
      })),
    },
    overrideAccess: true,
  });
  return updated as unknown as Cart;
}

export async function clearCartItems(userId: string): Promise<Cart> {
  const payload = await getPayloadInstance();
  const cart = await getOrCreateCart(userId);
  const updated = await payload.update({
    collection: "carts",
    id: cart.id,
    data: { items: [] },
    overrideAccess: true,
  });
  return updated as unknown as Cart;
}

/**
 * Позиции корзины, которые СЕЙЧАС можно заказать.
 *
 * Товары в корзине приходят развёрнутыми (getCartByUserId ходит с depth: 2),
 * поэтому доступность проверяется здесь без единого дополнительного запроса —
 * тем же общим правилом, что и в расчёте корзины (build-cart-view) и при
 * добавлении товара. Без этой проверки счётчик в шапке считал бы и снятые с
 * продажи позиции: корзина показывала бы «2 товара», а бейдж — «3».
 */
function orderableItems(cart: Cart | null): { product: Product; quantity: number }[] {
  const items = cart?.items ?? [];
  const result: { product: Product; quantity: number }[] = [];
  for (const item of items) {
    // Связь не развернулась — товара в базе нет, заказать его нельзя.
    if (typeof item.product !== "object" || item.product === null) continue;
    if (!isProductOrderable(item.product)) continue;
    result.push({ product: item.product, quantity: item.quantity });
  }
  return result;
}

/** Lightweight count for the header badge — no discount/pricing calculation. */
export async function getCartItemCount(userId: string): Promise<number> {
  const cart = await getCartByUserId(userId);
  return orderableItems(cart).reduce((sum, item) => sum + item.quantity, 0);
}

/** Product IDs currently in the cart — hydrates the client-side membership store. */
export async function getCartProductIds(userId: string): Promise<string[]> {
  const cart = await getCartByUserId(userId);
  return orderableItems(cart).map((item) => String(item.product.id));
}
