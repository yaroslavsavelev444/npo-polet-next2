import type { Category, Media } from "@/payload-types";

export interface CategoryImage {
	url: string;
	alt: string;
}

/**
 * Разбор связи «категория → изображение».
 *
 * Жил в CategoryCard, но нужен не только карточке: страница раздела берёт тот
 * же снимок для og:image. Импортировать ради одной функции компонент со всей
 * его разметкой — лишний повод затащить клиентский код в серверный модуль,
 * поэтому разбор переехал в lib.
 *
 * Возвращает null для неразрешённой связи (depth: 0 отдаёт число) и для
 * записи без файла — вызывающая сторона обязана показать заглушку, а не
 * пустой <img>.
 */
export function getImageData(image: Category["image"]): CategoryImage | null {
	if (!image || typeof image !== "object") return null;

	const media = image as Media;
	if (!media.url) return null;

	return { url: media.url, alt: media.alt ?? "" };
}
