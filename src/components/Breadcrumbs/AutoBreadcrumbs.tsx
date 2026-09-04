"use client";

import { usePathname } from "next/navigation";
import { type BreadcrumbItem, Breadcrumbs } from "./Breadcrumbs";

const routeMap: Record<string, string> = {
	"/": "Главная",
	"/about": "О нас",
	"/catalog": "Каталог",
	"/contacts": "Контакты",
	"/blog": "Блог",
	"/dashboard": "Личный кабинет",
};

export const AutoBreadcrumbs = () => {
	const pathname = usePathname();
	const segments = pathname.split("/").filter(Boolean);

	const items: BreadcrumbItem[] = [];
	let currentPath = "";

	for (const segment of segments) {
		currentPath += `/${segment}`;
		const title = routeMap[currentPath] || segment;
		items.push({ href: currentPath, title });
	}

	// Добавляем корневую страницу, если ещё не добавлена
	if (items.length > 0 && items[0].href !== "/") {
		items.unshift({ href: "/", title: routeMap["/"] });
	} else if (items.length === 0) {
		items.push({ title: routeMap["/"] });
	}

	// Последний элемент делаем без ссылки
	items[items.length - 1] = { title: items[items.length - 1].title };

	return <Breadcrumbs items={items} />;
};
