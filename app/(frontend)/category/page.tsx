export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import CategoryGrid from "@/modules/category/components/CategoryGrid";
import { CategoryToolbar } from "@/modules/category/components/CategoryToolbar";
import { applyCategoryFilters } from "@/modules/category/lib/applyCategoryFilters";
import { parseCategorySearchParams } from "@/modules/category/lib/parseFilters";
import { getCachedCategories } from "@/payload/services/categories.service";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";
import { Empty } from "@/UI";

export const metadata: Metadata = {
	title: "Каталог категорий",
	description: "Все категории товаров нашего магазина",
};

interface CategoriesPageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CategoriesPage({
	searchParams,
}: CategoriesPageProps) {
	const rawSearchParams = await searchParams;
	const filters = parseCategorySearchParams(rawSearchParams);

	const { docs: allCategories } = await getCachedCategories({
		isActive: true,
		sort: "order",
		limit: 200,
		depth: 1,
	});

	const filteredCategories = applyCategoryFilters(allCategories, filters);

	const breadcrumbItems = [
		{ title: "Главная", href: "/" },
		{ title: "Категории", href: "/category" },
	];

	return (
		<main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
			<div className="flex flex-col gap-6">
				<Breadcrumbs items={breadcrumbItems} variant="white" />
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(buildBreadcrumbSchema(breadcrumbItems)),
					}}
				/>

				<header className="flex flex-col gap-2">
					<h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
						Каталог категорий
					</h1>
					<p className="max-w-2xl text-base text-[var(--text-secondary)]">
						Выберите категорию, чтобы посмотреть товары
					</p>
				</header>
			</div>

			<Suspense fallback={<ToolbarSkeleton />}>
				<CategoryToolbar
					totalCount={allCategories.length}
					filteredCount={filteredCategories.length}
				/>
			</Suspense>

			{filteredCategories.length > 0 ? (
				<CategoryGrid categories={filteredCategories} columns={4} />
			) : (
				<Empty
					message="Категории не найдены"
					description={
						filters.q
							? "Попробуйте изменить поисковый запрос или очистить фильтры."
							: "Пока ещё нет доступных категорий."
					}
					size="lg"
					className="!py-20"
				/>
			)}
		</main>
	);
}

function ToolbarSkeleton() {
	return (
		<div aria-hidden className="flex flex-col gap-3">
			<div className="flex flex-col gap-3 sm:flex-row">
				<div className="h-10 animate-pulse rounded-md border border-[var(--border)] bg-[var(--surface)] sm:flex-1" />
				<div className="h-10 w-full animate-pulse rounded-md border border-[var(--border)] bg-[var(--surface)] sm:w-44" />
			</div>
			<div className="h-5 w-32 animate-pulse rounded bg-[var(--surface)]" />
		</div>
	);
}
