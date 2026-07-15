export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { OrderSuccessView } from "@/modules/orders";
import { getCachedOrderByOrderNumberForUser } from "@/payload/services/orders.service";

export const metadata = {
	title: "Заказы",
	robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
	params,
}: {
	params: Promise<{ orderNumber: string }>;
}) {
	const { orderNumber } = await params;
	const user = await getCurrentUser();
	if (!user) redirect(`/auth/login?from=/orders/${orderNumber}`);

	const order = await getCachedOrderByOrderNumberForUser(
		orderNumber,
		String(user.id),
	);
	if (!order) notFound();

	return <OrderSuccessView order={order} />;
}
