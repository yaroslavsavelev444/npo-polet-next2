export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { CheckoutPageClient } from "@/modules/checkout";
import { buildCheckoutView } from "@/modules/checkout/lib/build-checkout-view";

export const metadata = {
	title: "Оформление заказа",
	robots: { index: false, follow: false },
};

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Корзина", href: "/cart" },
	{ title: "Оформление заказа", href: "/checkout" },
];

/**
 * Оформление заказа.
 *
 * Полноширинная раскладка: общий layout витрины кладёт страницу в
 * центрированную колонку с отступом padding="l", а первому экрану он мешает —
 * полоса обязана идти во всю ширину окна и заезжать под шапку. Тот же приём,
 * что на главной, контактах, витрине каталога, в кабинете и «Моих заказах».
 *
 * Цепочка навигации отрисовывается ЗДЕСЬ и передаётся клиенту готовым узлом:
 * она полностью статична, и тащить её компонент в клиентский бандл ради этого
 * незачем.
 *
 * Пустая корзина разворачивает в /cart ещё на сервере: оформлять нечего, и
 * страница с формой была бы тупиком. Если корзина опустеет уже после
 * открытия формы (соседняя вкладка, снятый с продажи товар), это заметит
 * клиент и покажет объяснение, не теряя введённые данные, — см.
 * CheckoutPageClient.
 */
export default async function CheckoutPage() {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=/checkout");

	const checkoutView = await buildCheckoutView(String(user.id));

	if (checkoutView.cart.items.length === 0) {
		redirect("/cart");
	}

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<CheckoutPageClient
				initialView={checkoutView}
				user={{ name: user.name as string, email: user.email as string }}
				userId={String(user.id)}
				cartOnboardingSeen={Boolean(user.cartOnboardingSeenAt)}
				breadcrumbs={<Breadcrumbs items={BREADCRUMBS} />}
			/>
		</main>
	);
}
