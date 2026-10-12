import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { SupportReports } from "./reports/SupportReports";

/**
 * Отчёты чата поддержки — /admin/support/reports. Данные — через
 * /api/support/staff/reports и /live с собственной проверкой прав; здесь
 * только каркас и редирект гостя на вход (кастомные view Payload сами не
 * защищены).
 */
export async function SupportReportsView({
	initPageResult,
	params,
	searchParams,
}: AdminViewServerProps) {
	const { req, locale, permissions, visibleEntities } = initPageResult;
	if (!req.user || req.user.collection !== "admins") {
		redirect("/admin/login?redirect=%2Fadmin%2Fsupport%2Freports");
	}

	return (
		<DefaultTemplate
			i18n={req.i18n}
			locale={locale}
			params={params}
			payload={req.payload}
			permissions={permissions}
			searchParams={searchParams}
			user={req.user}
			visibleEntities={visibleEntities}
		>
			<SupportReports />
		</DefaultTemplate>
	);
}
