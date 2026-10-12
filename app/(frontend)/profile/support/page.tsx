export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { SupportHistory } from "@/modules/support-chat/widget/SupportHistory";
import { PageContainer } from "@/shared/components/PageContainer";

export const metadata: Metadata = {
	title: "Мои обращения",
	robots: { index: false, follow: false },
};

/**
 * «Мои обращения» — история переписки с менеджерами.
 *
 * Сюда же ведёт уведомление «Менеджер ответил» (со ?chat=open — окно чата
 * открывается поверх страницы). Путь под /profile защищён proxy.ts; проверка
 * ниже — на случай прямого рендера без прокси.
 */
export default async function SupportHistoryPage() {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=%2Fprofile%2Fsupport");

	return (
		<PageContainer>
			<h1>Мои обращения</h1>
			<p>
				Переписка с менеджерами. Текущий диалог можно продолжить в окне чата.
			</p>
			<SupportHistory />
		</PageContainer>
	);
}
