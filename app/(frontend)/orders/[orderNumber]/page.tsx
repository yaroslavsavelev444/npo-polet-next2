import { CheckCircle2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { OrderSuccessView } from "@/modules/checkout/components/OrderSuccessView";
import { formatPrice } from "@/modules/productCard";
import { getCachedOrderByOrderNumberForUser } from "@/payload/services/orders.service";

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
