/**
 * Общие правила учёта просмотров товара — для клиента (ProductViewTracker) и
 * маршрута записи (app/api/catalog/products/[id]/view).
 *
 * «Сессия» просмотра — 30 минут, как тайм-аут визита в Яндекс.Метрике: один
 * и тот же товар, открытый повторно в течение получаса (перезагрузка,
 * возврат «назад», вторая вкладка, переход из «похожих»), — это тот же интерес
 * того же человека, а не новый просмотр.
 */
export const PRODUCT_VIEW_WINDOW_MS = 30 * 60 * 1000;

export function getProductViewUrl(productId: string): string {
	return `/api/catalog/products/${encodeURIComponent(productId)}/view`;
}
