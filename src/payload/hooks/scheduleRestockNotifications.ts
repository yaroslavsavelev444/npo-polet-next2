import type { CollectionAfterChangeHook } from "payload";
import type { Product } from "../../../payload-types.ts";
import { hasRestockSubscribers } from "../services/restock-subscriptions.db.ts";
import { isProductOrderable } from "../utils/product-availability.ts";

/**
 * Товар вернулся в продажу → разослать уведомления тем, кто его ждал.
 *
 * «Вернулся» — это переход по общему правилу isProductOrderable (публикация,
 * флаг видимости, статус «в наличии»/«предзаказ») из «нельзя заказать» в
 * «можно». Любой путь считается: статус сменили с «нет в наличии» на «в
 * наличии», сняли скрытие, опубликовали черновик. Сохранение уже доступного
 * товара (правка цены, описания) переходом не является и ничего не ставит.
 *
 * Сам хук ничего не рассылает: он лишь ставит задачу в BullMQ (см.
 * modules/restock), и не ждёт даже её — ответ админке не зависит ни от
 * числа подписчиков, ни от доступности Redis. Если постановка не удалась,
 * подписки не теряются: их подберёт страховочный обход воркера.
 *
 * Очередь подключается динамическим импортом: коллекции загружает и CLI
 * Payload (генерация типов, миграции) в голом Node, где алиасы путей и
 * BullMQ не нужны. До импорта дело доходит только при реальном переходе и
 * только если товар кто-то ждёт.
 */
export const scheduleRestockNotifications: CollectionAfterChangeHook<
	Product
> = ({ doc, previousDoc, operation, req }) => {
	if (operation !== "update") return doc;
	if (!isProductOrderable(doc) || isProductOrderable(previousDoc)) return doc;

	const productId = Number(doc.id);
	void (async () => {
		try {
			if (!(await hasRestockSubscribers(req.payload, productId))) return;
			const { enqueueRestockNotification } = await import(
				"../../modules/restock/lib/queue.ts"
			);
			await enqueueRestockNotification(productId);
		} catch (error) {
			req.payload.logger.error({
				msg: "[restock] не удалось поставить рассылку о поступлении — её подберёт страховочный обход",
				productId,
				err: error,
			});
		}
	})();

	return doc;
};
