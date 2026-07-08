import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import type { OrderFilterGroup } from "@/modules/orders";
import {
  getOrdersListView,
  isValidFilterGroup,
  OrderFilters,
  OrdersPageClient,
  OrdersPagination,
} from "@/modules/orders";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Мои заказысрфе",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?from=/orders");

  const params = await searchParams;
  const group: OrderFilterGroup = isValidFilterGroup(params.status)
    ? params.status
    : "all";
  const page = Math.max(1, Number(params.page) || 1);

  const result = await getOrdersListView(String(user.id), group, page);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold text-(--text-primary) sm:text-3xl">
        Мои заказы
      </h1>

      <OrderFilters active={group} />

      <OrdersPageClient key={`${group}:${page}`} initialResult={result} />

      <OrdersPagination
        page={result.page}
        totalPages={result.totalPages}
        hasNextPage={result.hasNextPage}
        hasPrevPage={result.hasPrevPage}
      />
    </main>
  );
}
