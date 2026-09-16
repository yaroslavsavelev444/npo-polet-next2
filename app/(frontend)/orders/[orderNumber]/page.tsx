export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { OrderPageView } from "@/modules/orders";
import { getCachedOrderByOrderNumberForUser } from "@/payload/services/orders.service";

interface PageProps {
	params: Promise<{ orderNumber: string }>;
}

/**
 * Заголовок вкладки содержит номер заказа: у покупателя таких вкладок бывает
 * несколько, и «Заказы» на каждой не помогает различить их ни при
 * переключении, ни в истории браузера.
 */
export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { orderNumber } = await params;
	return {
		title: `Заказ № ${orderNumber}`,
		robots: { index: false, follow: false },
	};
}

/**
 * Страница заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОДИН АДРЕС НА ВСЮ ЖИЗНЬ ЗАКАЗА
 * ────────────────────────────────────────────────────────────────────────────
 * Сюда попадают тремя путями: сразу после оформления, из «Моих заказов» и по
 * прямой ссылке. Данные во всех трёх случаях одни и те же и берутся из базы,
 * а не из состояния перехода, — поэтому перезагрузка, возврат назад и
 * открытие ссылки через месяц показывают одно и то же. Единственное, что
 * отличает переход с оформления, — конфетти (см. modules/orders,
 * lib/celebrate-order).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДОСТУП
 * ────────────────────────────────────────────────────────────────────────────
 * Заказ читается ТОЛЬКО как собственный: getCachedOrderByOrderNumberForUser
 * ищет по паре «номер + владелец». Чужой номер, подобранный в адресной
 * строке, неотличим от несуществующего — оба дают 404, и по ответу нельзя
 * узнать, существует ли такой заказ у кого-то другого.
 */
export default async function OrderPage({ params }: PageProps) {
	const { orderNumber } = await params;
	const user = await getCurrentUser();
	if (!user) redirect(`/auth/login?from=/orders/${orderNumber}`);

	const order = await getCachedOrderByOrderNumberForUser(
		orderNumber,
		String(user.id),
	);
	if (!order) notFound();

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l"; первому экрану он мешает — полоса обязана идти
		// во всю ширину окна и заезжать под шапку. Тот же приём, что на главной,
		// в кабинете, каталоге, «Моих заказах» и на оформлении.
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<OrderPageView
				order={order}
				breadcrumbs={
					<Breadcrumbs
						items={[
							{ title: "Главная", href: "/" },
							{ title: "Мои заказы", href: "/orders" },
							{ title: `Заказ № ${orderNumber}` },
						]}
					/>
				}
			/>
		</main>
	);
}
