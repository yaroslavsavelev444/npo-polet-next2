import type { Payload } from "payload";
import { getProductHrefFromDoc } from "@/modules/productCard/lib/routing";
import {
	listProductsWithSubscribers,
	notifyRestockBatch,
} from "@/payload/services/restock-subscriptions.db";
import { isProductOrderable } from "@/payload/utils/product-availability";
import type { Product } from "@/payload-types";
import { RESTOCK_BATCH_SIZE } from "./constants";

export type RestockResult =
	| { status: "notified"; count: number }
	| { status: "not_orderable" }
	| { status: "gone" };

/**
 * Рассылает уведомления всем, кто ждёт товар, — если его действительно можно
 * заказать СЕЙЧАС.
 *
 * Доступность перепроверяется в момент выполнения, а не берётся из момента
 * постановки задачи: между ними товар мог снова закончиться. Тогда подписки
 * остаются нетронутыми и дождутся следующего возвращения.
 *
 * Пачки обрабатываются до опустошения. Повтор после сбоя безопасен: каждая
 * пачка атомарно закрывает свои подписки (см. notifyRestockBatch), так что
 * уже уведомлённые второй раз не попадут.
 */
export async function processRestockForProduct(
	payload: Payload,
	productId: number,
): Promise<RestockResult> {
	let product: Product;
	try {
		// Без draft: читается опубликованная версия — та, что видна на витрине.
		product = (await payload.findByID({
			collection: "products",
			id: productId,
			depth: 1,
			overrideAccess: true,
		})) as Product;
	} catch {
		// Товар удалён — его подписки уже снесены каскадом.
		return { status: "gone" };
	}

	if (!isProductOrderable(product)) return { status: "not_orderable" };

	const productTitle = product.title;
	const productUrl = getProductHrefFromDoc(product);

	let count = 0;
	for (;;) {
		const notified = await notifyRestockBatch(payload, {
			productId,
			productTitle,
			productUrl,
			limit: RESTOCK_BATCH_SIZE,
		});
		count += notified;
		if (notified < RESTOCK_BATCH_SIZE) break;
	}

	return { status: "notified", count };
}

/**
 * Страховочный обход: всё, что должно было быть разослано, но не было.
 *
 * Основной путь — задача из хука товара. Но постановка задачи может не
 * состояться (Redis недоступен в момент сохранения, товар изменён скриптом
 * вне приложения), и тогда без обхода подписчики ждали бы до следующего
 * возвращения товара — то есть, возможно, никогда. Обход дешёвый: товаров с
 * подписчиками немного, а недоступные из них отсеиваются одной проверкой.
 */
export async function sweepRestockSubscriptions(
	payload: Payload,
): Promise<number> {
	const productIds = await listProductsWithSubscribers(payload);
	let total = 0;
	for (const productId of productIds) {
		const result = await processRestockForProduct(payload, productId);
		if (result.status === "notified") total += result.count;
	}
	return total;
}
