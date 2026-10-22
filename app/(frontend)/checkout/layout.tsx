import { WebvisorPrivate } from "@/widgets/Analytics/webvisor";

/** Получатель, телефоны, адрес, реквизиты компании — не в запись Вебвизора (webvisor.tsx). */
export default function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <WebvisorPrivate>{children}</WebvisorPrivate>;
}
