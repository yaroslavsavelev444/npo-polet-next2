import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { env } from "@/env";
import { getSupportConfig } from "../server/settings";
import { SupportConsole } from "./console/SupportConsole";

/**
 * Консоль поддержки — /admin/support (регистрация — payload.config.ts,
 * admin.components.views).
 *
 * Кастомные view Payload НЕ защищены авторизацией сами: без проверки ниже
 * страницу (пустую, но всё же) получил бы любой. Данных она не раскрывает —
 * всё приходит через шлюз и API с собственной проверкой, — но гость должен
 * попадать на вход, а не в каркас консоли.
 */
export async function SupportConsoleView({
	initPageResult,
	params,
	searchParams,
}: AdminViewServerProps) {
	const { req, locale, permissions, visibleEntities } = initPageResult;
	const user = req.user;

	if (!user || user.collection !== "admins") {
		redirect("/admin/login?redirect=%2Fadmin%2Fsupport");
	}

	const admin = user as {
		id: number | string;
		name?: string;
		support?: { displayName?: string | null };
	};
	const name = admin.support?.displayName?.trim() || admin.name || "Менеджер";
	const config = await getSupportConfig(req.payload);

	return (
		<DefaultTemplate
			i18n={req.i18n}
			locale={locale}
			params={params}
			payload={req.payload}
			permissions={permissions}
			searchParams={searchParams}
			user={user}
			visibleEntities={visibleEntities}
		>
			<SupportConsole
				me={{ adminId: Number(admin.id), name }}
				socketUrl={env.SUPPORT_GATEWAY_PUBLIC_URL ?? null}
				siteUrl={env.NEXT_PUBLIC_APP_URL ?? ""}
				slaMinutes={config.routing.firstResponseSlaMinutes}
				initialConversationId={
					typeof searchParams?.c === "string" && /^\d+$/.test(searchParams.c)
						? Number(searchParams.c)
						: null
				}
			/>
		</DefaultTemplate>
	);
}
