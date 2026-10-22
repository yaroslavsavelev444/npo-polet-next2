import { WebvisorPrivate } from "@/widgets/Analytics/webvisor";

/** Заказы: получатель, адрес доставки, контакты — не в запись Вебвизора (webvisor.tsx). */
export default function OrdersLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <WebvisorPrivate>{children}</WebvisorPrivate>;
}
