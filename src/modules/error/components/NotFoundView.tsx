import { BookOpen, Home, LifeBuoy, Package } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/UI/Button/Button.styles";
import { BackButton } from "./BackButton";
import { DestinationList } from "./DestinationList";
import { ErrorView } from "./ErrorView";

const DESTINATIONS = [
	{
		href: "/category",
		label: "Каталог продукции",
		hint: "Сеткомёты, установки и комплектующие",
		icon: Package,
	},
	{
		href: "/knowledge",
		label: "База знаний",
		hint: "Руководства, инструкции и разборы",
		icon: BookOpen,
	},
	{
		href: "/contacts",
		label: "Контакты",
		hint: "Связаться с нами напрямую",
		icon: LifeBuoy,
	},
];

/**
 * Единая страница 404 для всего сайта.
 *
 * Используется из двух точек входа и выглядит одинаково в обеих:
 *  - `app/(frontend)/not-found.tsx` — когда страница сама вызвала notFound()
 *    (нет такого товара/категории/статьи, либо ресурс не должен быть доступен
 *    этому пользователю — тогда 404 сознательно скрывает сам факт его
 *    существования);
 *  - `app/global-not-found.tsx` — когда URL не совпал ни с одним маршрутом.
 *
 * Отдельных визуальных страниц под частные сценарии 404 намеренно нет:
 * различать «нет товара» и «нет статьи» пользователю нечем и незачем, а
 * раскрывать причину недоступности ресурса — прямой сигнал о его наличии.
 */
export function NotFoundView() {
	const homeClassName = buttonStyles("primary", "md", false);

	return (
		<ErrorView
			code="404"
			title="Такой страницы нет"
			description="Адрес введён с ошибкой, либо страница была перемещена или удалена. Всё остальное на месте — вот основные разделы."
			actions={
				<>
					<Link href="/" className={homeClassName}>
						<Home size={16} aria-hidden />
						На главную
					</Link>
					<BackButton />
				</>
			}
			footer={<DestinationList destinations={DESTINATIONS} />}
		/>
	);
}

export default NotFoundView;
