export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import {
	getOrdersListView,
	getOrdersSummary,
	isValidFilterGroup,
	type OrderFilterGroup,
	OrdersHero,
	OrdersPageClient,
	OrdersPagination,
	OrdersRail,
} from "@/modules/orders";
import { PageContainer } from "@/shared/components/PageContainer";

export const metadata: Metadata = {
	title: "Мои заказы",
	robots: { index: false, follow: false },
};

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Мои заказы", href: "/orders" },
];

interface PageProps {
	searchParams: Promise<{ status?: string; page?: string }>;
}

/**
 * «Мои заказы» — продолжение личного кабинета.
 *
 * Три яруса, как у кабинета и витрины каталога, от общего к частному:
 *
 *   1. первый экран — сколько заказов всего и сколько в работе;
 *   2. липкая панель — отбор по состоянию и размер текущей выдачи;
 *   3. список — сами заказы, каждый раскрывается на месте.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Два независимых запроса идут одним Promise.all: страница выдачи и счётчики
 * по вкладкам. Зависимости между ними нет, а последовательно они складывались
 * бы в сумму задержек.
 *
 * Отбор и постраничная навигация остаются серверными: заказов у покупателя
 * бывают сотни, они приходят страницами по десять, и отбирать их на клиенте
 * означало бы сначала выгрузить все. Этим страница отличается от витрины
 * каталога, где разделов два десятка и отбор идёт в памяти браузера.
 *
 * key на клиентском списке — `${group}:${page}`: при смене отбора или
 * страницы состояние раскрытых заказов и загруженных подробностей относится
 * к другой выдаче, и переносить его нельзя.
 */
export default async function OrdersPage({ searchParams }: PageProps) {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=/orders");

	const params = await searchParams;
	const group: OrderFilterGroup = isValidFilterGroup(params.status)
		? params.status
		: "all";
	const page = Math.max(1, Number(params.page) || 1);

	const [result, summary] = await Promise.all([
		getOrdersListView(String(user.id), group, page),
		getOrdersSummary(String(user.id)),
	]);

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l". Первому экрану он мешает: полоса обязана идти
		// во всю ширину окна и заезжать под шапку. Тот же приём, что на
		// главной, контактах, витрине каталога и в кабинете.
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<OrdersHero
				breadcrumbs={BREADCRUMBS}
				totalOrders={summary.total}
				activeOrders={summary.active}
			/>

			<PageContainer className="pb-[4rem]">
				{/* Панель — прямой потомок колонки, без обёртки: её собственный
				    отступ задан в .rail, а обёртка ростом с панель отняла бы у
				    position: sticky ход (разбор — в Catalog.module.css). */}
				<div className="flex flex-col">
					<OrdersRail
						active={group}
						counts={summary.byGroup}
						totalDocs={result.totalDocs}
					/>

					<div className="mt-[1.5rem] sm:mt-[2rem]">
						<OrdersPageClient
							key={`${group}:${page}`}
							initialResult={result}
							group={group}
						/>

						<OrdersPagination
							page={result.page}
							totalPages={result.totalPages}
							hasNextPage={result.hasNextPage}
							hasPrevPage={result.hasPrevPage}
						/>
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
