import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import CategoryFilters from "@/modules/category/components/CategoryFilters";
import CategoryGrid from "@/modules/category/components/CategoryGrid";
import { getCachedCategories } from "@/payload/services/categories.service";
import type { Category } from "@/payload-types";

export const metadata: Metadata = {
  title: "Каталог категорий",
  description: "Все категории товаров нашего магазина",
};

type SortField = "order" | "name" | "createdAt";
type SortOrder = "asc" | "desc";

interface SearchParams {
  q?: string;
  sort?: SortField;
  order?: SortOrder;
  page?: string;
}

interface CategoriesPageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Серверная фильтрация.
 * Здесь нет никакого client-side JS.
 */
function applyFilters(
  categories: Category[],
  params: SearchParams,
): Category[] {
  const search = params.q?.trim().toLowerCase() ?? "";

  const sortBy = params.sort ?? "order";

  const sortOrder = params.order ?? "asc";

  let result = categories;

  /**
   * Поиск
   */
  if (search.length > 0) {
    result = result.filter((category) => {
      const values = [
        category.name,
        category.subtitle,
        category.description,
        category.slug,
        ...(category.keywords?.map((item) =>
          typeof item === "object" ? item.keyword : "",
        ) ?? []),
      ];

      return values.some(
        (value) =>
          typeof value === "string" && value.toLowerCase().includes(search),
      );
    });
  }

  /**
   * Сортировка
   */
  const sign = sortOrder === "asc" ? 1 : -1;

  result = [...result].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return sign * a.name.localeCompare(b.name, "ru");

      case "createdAt":
        return (
          sign *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );

      case "order":
      default: {
        const aOrder = (a as any).order ?? 0;
        const bOrder = (b as any).order ?? 0;

        return sign * (aOrder - bOrder);
      }
    }
  });

  return result;
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const params = await searchParams;

  const { docs: allCategories } = await getCachedCategories({
    isActive: true,
    sort: "order",
    limit: 200,
    depth: 1,
  });

  const filteredCategories = applyFilters(allCategories, params);

  const breadcrumbItems = [
    { title: "Главная", href: "/" },
    { title: "Категории", href: "/category" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Filters */}
      <Breadcrumbs items={breadcrumbItems} variant="white" />
      <Suspense fallback={<FiltersSkeleton />}>
        <CategoryFilters
          totalCount={allCategories.length}
          filteredCount={filteredCategories.length}
        />
      </Suspense>

      {/* Grid */}

      {filteredCategories.length > 0 ? (
        <CategoryGrid categories={filteredCategories} columns={4} />
      ) : (
        <EmptyState hasSearch={Boolean(params.q)} />
      )}
    </main>
  );
}

function FiltersSkeleton() {
  return (
    <div
      aria-hidden
      className="mb-8 h-14 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    />
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-8 py-20 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--neutral-alpha-medium)]">
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="text-[var(--text-secondary)]"
        >
          <path d="M3 7h18" />
          <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
          <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold">Категории не найдены</h2>

      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        {hasSearch
          ? "Попробуйте изменить поисковый запрос или очистить фильтры."
          : "Пока ещё нет доступных категорий."}
      </p>
    </section>
  );
}
