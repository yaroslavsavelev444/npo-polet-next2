export const RESTOCK_QUEUE = "restock-notifications";

/** Разослать уведомления подписчикам одного товара. */
export const RESTOCK_PRODUCT_JOB = "product";
/** Страховочный обход: все товары, у которых есть подписчики. */
export const RESTOCK_SWEEP_JOB = "sweep";
export const RESTOCK_SWEEP_SCHEDULER_ID = "restock-sweep";
/** Раз в 10 минут: цена пропущенного события — задержка, а не потеря. */
export const RESTOCK_SWEEP_EVERY_MS = 10 * 60 * 1000;

/**
 * Задержка перед обработкой товара. Хук afterChange выполняется ВНУТРИ
 * транзакции сохранения товара, и задача, взятая воркером мгновенно, могла бы
 * прочитать товар ещё в старом статусе. Пять секунд с запасом покрывают
 * фиксацию транзакции; если и их не хватит, подписки не пропадут — их
 * подберёт страховочный обход.
 */
export const RESTOCK_JOB_DELAY_MS = 5000;

/** Подписок за один SQL-запрос. См. notifyRestockBatch. */
export const RESTOCK_BATCH_SIZE = 500;
