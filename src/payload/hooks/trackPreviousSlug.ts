// src/payload/hooks/trackPreviousSlug.ts
import type { CollectionBeforeChangeHook } from "payload";

/**
 * Сохраняет прежний slug товара в previousSlugs при его смене.
 *
 * Порядок хуков в Payload: field-level beforeValidate (generateSlug) уже
 * посчитал финальное значение data.slug к моменту, когда стартуют
 * collection-level beforeChange — то есть здесь мы видим итоговый новый slug,
 * а не промежуточное состояние.
 *
 * Зачем это вообще нужно: адрес страницы товара уже мог быть проиндексирован
 * поисковиком. Если слово в названии переводится криво (частый случай:
 * артикулы вида "30БН" транслитерируются как "zobn" из-за визуально похожих
 * кириллических и латинских символов) и его потом исправляют, обычная смена
 * slug молча превращает старый, уже проиндексированный URL в 404 — теряется
 * весь накопленный вес страницы. Резолвер страницы товара
 * (app/.../products/[slug]/page.tsx) ищет товар сначала по текущему slug,
 * а не найдя — по previousSlugs, и в этом случае уводит 308-редиректом на
 * актуальный адрес.
 */
export const trackPreviousSlug: CollectionBeforeChangeHook = ({
	data,
	originalDoc,
	operation,
}) => {
	if (operation !== "update") return data;

	const oldSlug = originalDoc?.slug as string | undefined | null;
	const newSlug = data.slug as string | undefined | null;

	if (!oldSlug || !newSlug || oldSlug === newSlug) return data;

	const history: Array<{ slug: string }> = Array.isArray(
		originalDoc?.previousSlugs,
	)
		? originalDoc.previousSlugs
		: [];

	// Убираем из истории сам newSlug (на случай A -> B -> A — иначе в истории
	// осталась бы запись, указывающая сама на себя) и старый дубль oldSlug,
	// если он там почему-то уже был.
	const deduped = history.filter(
		(entry) => entry.slug !== newSlug && entry.slug !== oldSlug,
	);

	data.previousSlugs = [...deduped, { slug: oldSlug }];

	return data;
};
