// Серверная точка входа модуля отзывов. Отделена от index.ts, потому что
// getReviewsSectionData тянет reviews.service (payload.db, SQL) — такое нельзя
// притаскивать в клиентский бандл. Импортируйте только из серверных
// компонентов (страница товара).
export { getReviewsSectionData } from "./lib/get-reviews-section-data";
