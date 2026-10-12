export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import styles from "@/modules/support-chat/history/history.module.css";
import { StartChatButton } from "@/modules/support-chat/history/StartChatButton";
import { SupportHero } from "@/modules/support-chat/history/SupportHero";
import { SupportHistory } from "@/modules/support-chat/history/SupportHistory";
import type { EtaDTO } from "@/modules/support-chat/lib/events";
import { supportDeps } from "@/modules/support-chat/server/http";
import { customerActorFromUser } from "@/modules/support-chat/server/permissions";
import {
	getSupportConfig,
	isChatOpenForUser,
} from "@/modules/support-chat/server/settings";
import {
	customerUnreadConversationIds,
	getEta,
	listCustomerConversations,
} from "@/modules/support-chat/server/support.service";
import { PageContainer } from "@/shared/components/PageContainer";

export const metadata: Metadata = {
	title: "Мои обращения",
	robots: { index: false, follow: false },
};

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Мои обращения", href: "/profile/support" },
];

/**
 * «Мои обращения» — история переписки с менеджерами.
 *
 * Раскладка кабинета: полоса первого экрана во всю ширину (заезжает под
 * шапку), под ней — липкая панель отбора и разлинованный список, как в «Моих
 * отзывах». Список и состояние связи считаются здесь, на сервере: первый экран
 * приходит готовым, без «Загрузка…», и кнопка «Написать менеджеру» не
 * появляется с задержкой — сервер уже знает, доступен ли чат покупателю.
 *
 * Сюда же ведёт уведомление «Менеджер ответил» (со ?chat=open — окно чата
 * открывается поверх страницы). Путь под /profile защищён proxy.ts; проверка
 * ниже — на случай прямого рендера без прокси.
 */
export default async function SupportHistoryPage() {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=%2Fprofile%2Fsupport");

	const actor = customerActorFromUser(user);
	const deps = await supportDeps();
	const config = await getSupportConfig(deps.payload);
	const banned = actor?.chatBanned === true;
	const chatAvailable =
		actor !== null && !banned && isChatOpenForUser(config, actor.userId);

	const [conversations, unreadIds, eta] = await Promise.all([
		actor ? listCustomerConversations(deps, actor) : [],
		actor ? customerUnreadConversationIds(deps, actor) : [],
		chatAvailable ? getEta(deps) : Promise.resolve<EtaDTO | null>(null),
	]);
	const hasOpen = conversations.some((c) => c.status === "open");

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<SupportHero
				breadcrumbs={BREADCRUMBS}
				aside={
					<div className={styles.aside}>
						{chatAvailable && eta ? (
							<>
								<p className={styles.presence}>
									<span
										className={`${styles.presenceDot} ${eta.online ? "" : styles.presenceOff}`}
										aria-hidden
									/>
									{eta.label}
								</p>
								<p className={styles.asideText}>
									Ответ придёт в окно чата на любой странице сайта, а вся
									переписка останется здесь.
								</p>
								<StartChatButton
									label={hasOpen ? "Продолжить диалог" : "Написать менеджеру"}
								/>
							</>
						) : banned ? (
							<p className={styles.asideText}>
								Отправка сообщений в чат для вашего аккаунта ограничена. История
								переписки остаётся доступной. По срочным вопросам —{" "}
								<Link href="/contacts" className={styles.asideLink}>
									контакты
								</Link>
								.
							</p>
						) : (
							<p className={styles.asideText}>
								Здесь хранится переписка с менеджерами. Связаться с нами можно
								по телефону и почте — они на странице{" "}
								<Link href="/contacts" className={styles.asideLink}>
									«Контакты»
								</Link>
								.
							</p>
						)}
					</div>
				}
			/>

			<PageContainer className="pb-[4rem]">
				<SupportHistory
					conversations={conversations}
					unreadIds={unreadIds}
					chatAvailable={chatAvailable}
				/>
			</PageContainer>
		</main>
	);
}
