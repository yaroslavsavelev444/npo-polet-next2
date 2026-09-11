export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserActiveSessions } from "@/modules/auth/lib/session";
import { isUser } from "@/modules/auth/lib/typeGuards";
import {
	changePasswordAction,
	logoutAction,
	refreshSessionsAction,
	revokeSessionAction,
	updateAccountAction,
} from "@/modules/profile/actions";
import { ProfileClient } from "@/modules/profile/components/ProfileClient";
import type {
	ProfileSession,
	ProfileTab,
	ProfileUser,
} from "@/modules/profile/types/profile.types";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const metadata: Metadata = {
	title: "Личный кабинет",
	robots: { index: false, follow: false },
};

const TAB_KEYS: ProfileTab[] = ["account", "security", "sessions"];

/** Раздел из адреса. Неизвестное значение — не ошибка, а «открой первый». */
function parseTab(value: string | string[] | undefined): ProfileTab {
	const key = Array.isArray(value) ? value[0] : value;
	return TAB_KEYS.includes(key as ProfileTab) ? (key as ProfileTab) : "account";
}

interface ProfilePageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * /profile — серверный компонент.
 *
 * Пользователь и сессии берутся через Local API Payload (без обращения по
 * HTTP к самому себе), дальше всё взаимодействие — в ProfileClient. Server
 * Actions передаются пропсами, чтобы в тестах их можно было подменить
 * заглушками.
 *
 * Активный раздел приходит из адреса и разбирается ЗДЕСЬ, а не в клиенте:
 * так первая отрисовка на сервере сразу показывает нужный раздел, а не
 * «Аккаунт», который через кадр подменяется другим.
 *
 * Полноширинная раскладка. Общий layout витрины кладёт страницу в
 * центрированную колонку с отступом padding="l"; первому экрану кабинета он
 * мешает — полоса обязана идти во всю ширину окна и заезжать под шапку.
 * .full-bleed возвращает полную ширину, отрицательные поля снимают
 * вертикальный отступ. Тот же приём, что на главной, контактах и витрине
 * каталога.
 */
export default async function ProfilePage({ searchParams }: ProfilePageProps) {
	// ─── Проверка доступа ───────────────────────────────────────────────────

	const cookieStore = await cookies();
	if (!cookieStore.get("payload-token")) redirect("/auth/login");

	const h = await headers();
	const payload = await getPayloadInstance();
	const { user } = await payload.auth({ headers: h });
	if (!user || !isUser(user)) redirect("/auth/login");

	// ─── Данные ─────────────────────────────────────────────────────────────

	const initialTab = parseTab((await searchParams).tab);
	const currentSessionId = cookieStore.get("session-id")?.value;

	const rawSessions = await getUserActiveSessions(payload, String(user.id));
	const sessions: ProfileSession[] = rawSessions.map((s) => ({
		id: String(s.id),
		deviceLabel: (s.deviceLabel ?? "Устройство") as string,
		ip: s.ip as string | undefined,
		createdAt: s.createdAt as string,
		lastActiveAt: s.lastActiveAt as string,
		isCurrent: String(s.id) === currentSessionId,
	}));

	const profileUser: ProfileUser = {
		id: String(user.id),
		name: user.name as string,
		email: user.email as string,
		role: user.role as string,
		status: user.status as string,
		emailVerified: user.emailVerified as boolean | undefined,
		lastLoginAt: user.lastLoginAt as string | undefined,
	};

	// ─── Отрисовка ──────────────────────────────────────────────────────────

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<ProfileClient
				user={profileUser}
				sessions={sessions}
				initialTab={initialTab}
				actions={{
					updateAccount: updateAccountAction,
					changePassword: changePasswordAction,
					revokeSession: revokeSessionAction,
					refreshSessions: refreshSessionsAction,
					logout: logoutAction,
				}}
			/>
		</main>
	);
}
