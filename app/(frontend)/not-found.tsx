import type { Metadata } from "next";
import { NotFoundView } from "@/modules/error";

// Next сам добавляет <meta name="robots" content="noindex"> ответам со
// статусом 404, но title/description он не выдумает — задаём явно, чтобы
// вкладка и шаринг не показывали заголовок родительского layout'а.
export const metadata: Metadata = {
	title: "Страница не найдена",
	description: "Запрашиваемая страница отсутствует либо была перемещена.",
	robots: { index: false, follow: true },
};

/**
 * 404 внутри витрины: срабатывает, когда страница сама вызвала notFound().
 * Рендерится в общем layout'е — с шапкой, футером и всей навигацией.
 *
 * URL, не совпавшие ни с одним маршрутом, сюда НЕ попадают: в проекте два
 * корневых layout'а (витрина и админка Payload), поэтому Next не может выбрать
 * layout для несуществующего маршрута и отдаёт их в app/global-not-found.tsx.
 */
export default function NotFound() {
	return <NotFoundView />;
}
