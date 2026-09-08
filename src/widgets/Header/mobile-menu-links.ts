/**
 * Состав мобильного меню.
 *
 * Вынесено из компонента, потому что набор пунктов — это НЕ вёрстка: он
 * зависит от того, авторизован ли посетитель, и меняется вместе с
 * маршрутами проекта. Держать его отдельным списком дешевле, чем искать
 * ссылки среди JSX, и невозможно случайно оставить пункт только в одной из
 * двух веток.
 *
 * Все href обязаны быть реальными маршрутами app/(frontend). Проверено на
 * момент правки: /category, /knowledge, /faq, /contacts, /consents,
 * /profile, /orders, /wishlist, /reviews, /cart, /auth/login,
 * /auth/register.
 */

export interface MobileNavLink {
	label: string;
	href: string;
}

/**
 * Крупные ссылки — верхний уровень навигации.
 *
 * Подписи короткие намеренно: набраны они акцидентной PaluiSP2, у которой
 * знак занимает ~1.2em (против ~0.5em у Manrope). «Вопросы и ответы» в этом
 * кегле заняло бы три строки на экране 375px и развалило бы ритм списка.
 *
 * Гость видит 4 пункта, авторизованный — 6: личные разделы появляются
 * только тогда, когда им есть куда вести.
 */
export function getPrimaryLinks(isAuthenticated: boolean): MobileNavLink[] {
	const catalog: MobileNavLink = { label: "Каталог", href: "/category" };
	const common: MobileNavLink[] = [
		{ label: "База знаний", href: "/knowledge" },
		{ label: "Вопросы", href: "/faq" },
		{ label: "Контакты", href: "/contacts" },
	];

	if (!isAuthenticated) return [catalog, ...common];

	return [
		catalog,
		{ label: "Профиль", href: "/profile" },
		{ label: "Заказы", href: "/orders" },
		...common,
	];
}

/**
 * Второстепенные ссылки нижнего ряда. Здесь всё, что нужно редко: юридические
 * документы и разделы кабинета второго порядка.
 *
 * «Выйти» сюда не попадает — это не ссылка, а server action, и рисуется
 * отдельной кнопкой в том же ряду (см. MobileMenu).
 */
export function getSecondaryLinks(isAuthenticated: boolean): MobileNavLink[] {
	if (!isAuthenticated) {
		return [
			{ label: "Регистрация", href: "/auth/register" },
			{ label: "Соглашения", href: "/consents" },
		];
	}

	return [
		{ label: "Избранное", href: "/wishlist" },
		{ label: "Мои отзывы", href: "/reviews" },
		{ label: "Соглашения", href: "/consents" },
	];
}

/**
 * Активен ли пункт для текущего пути. Точное совпадение или вложенный
 * маршрут («/category/setkomet» подсвечивает «Каталог»), но «/» не должен
 * подсвечивать всё подряд — поэтому проверка идёт по префиксу со слэшем.
 */
export function isLinkActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}
