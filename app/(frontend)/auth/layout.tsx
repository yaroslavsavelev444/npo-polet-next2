// app/(frontend)/auth/layout.tsx
import type { Metadata } from "next";
import { WebvisorPrivate } from "@/widgets/Analytics/webvisor";

export const metadata: Metadata = {
	title: { default: "Авторизация", template: "%s — НПО Полёт" },
	robots: { index: false, follow: false },
};

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Почта, коды, имя — не в запись Вебвизора.
	return <WebvisorPrivate>{children}</WebvisorPrivate>;
}
