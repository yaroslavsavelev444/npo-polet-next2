export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { WishlistPageClient } from "@/modules/wishlist/components/WishlistPageClient";
import { buildWishlistView } from "@/modules/wishlist/lib/build-wishlist-view";
import { getWishlistByUserId } from "@/payload/services/wishlists.service";

export const metadata: Metadata = {
	title: "Избранное",
	robots: { index: false, follow: false },
};

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Избранное", href: "/wishlist" },
];

/**
 * «Избранное» — раздел личного кабинета.
 *
 * Страница целиком строится вокруг ГОТОВОЙ сетки товаров: карточка и сетка
 * приходят из productCard и здесь не переопределяются. Всё остальное —
 * первый экран, липкая панель, пустое состояние, подтверждение очистки —
 * принадлежит этому разделу (см. WishlistPageClient).
 *
 * Данные приходят одним документом: избранное не постранично и не может быть
 * большим, поэтому и отбор, и порядок показа живут на клиенте, мгновенно и
 * без обращений к серверу. Этим раздел отличается от заказов и отзывов, где
 * записей сотни и всё считает сервер.
 */
export default async function WishlistPage() {
	const user = await getCurrentUser();
	if (!user) {
		redirect("/auth/login?from=/wishlist");
	}

	const wishlist = await getWishlistByUserId(String(user.id));
	const wishlistView = buildWishlistView(wishlist);

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l". Первому экрану он мешает: полоса обязана идти во
		// всю ширину окна и заезжать под шапку. Тот же приём, что на главной,
		// контактах, витрине каталога, в кабинете, заказах и отзывах.
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<WishlistPageClient
				initialWishlist={wishlistView}
				breadcrumbs={BREADCRUMBS}
			/>
		</main>
	);
}
