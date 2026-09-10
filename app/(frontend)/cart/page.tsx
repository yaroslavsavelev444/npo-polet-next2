// app/(frontend)/cart/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { CartPageClient } from "@/modules/cart/components/CartPageClient";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { getCartByUserId } from "@/payload/services/carts.service";
import { getCachedCategories } from "@/payload/services/categories.service";

export const metadata = {
	title: "Корзина",
	robots: { index: false, follow: false },
};

/**
 * Страница корзины.
 *
 * Гостя здесь больше НЕ разворачивает на вход. Корзина работает и без
 * аккаунта: состав гостя хранится локально и переносится в профиль после
 * входа (см. modules/cart — CartProvider, mergeGuestCartAction). Прежний
 * redirect означал, что до входа корзины не существует вовсе, — и товар,
 * выбранный гостем, терялся на переходе к форме входа.
 *
 * Серверных данных для гостя нет и быть не может: его корзина живёт в
 * браузере. Поэтому ему страница отдаётся без начального состава, а клиент
 * наполняет её из localStorage (и показывает заглушку, пока считает цены).
 */
export default async function CartPage() {
	const [user, categoriesResult] = await Promise.all([
		getCurrentUser(),
		getCachedCategories({ isActive: true, sort: "order" }),
	]);

	const categories = (categoriesResult?.docs ?? []).map((category) => ({
		id: String(category.id),
		name: category.name,
		slug: category.slug ?? "",
	}));

	if (!user) {
		return (
			<CartPageClient
				initialCart={null}
				categories={categories}
				userId={null}
				onboardingSeen
			/>
		);
	}

	const cart = await getCartByUserId(String(user.id));
	const cartView = await buildCartView(cart);

	return (
		<CartPageClient
			initialCart={cartView}
			categories={categories}
			userId={String(user.id)}
			onboardingSeen={Boolean(user.cartOnboardingSeenAt)}
		/>
	);
}
