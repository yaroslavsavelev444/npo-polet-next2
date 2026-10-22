import { WebvisorPrivate } from "@/widgets/Analytics/webvisor";

/** Данные покупателя, сессии, обращения в чат — не в запись Вебвизора (webvisor.tsx). */
export default function ProfileLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <WebvisorPrivate>{children}</WebvisorPrivate>;
}
