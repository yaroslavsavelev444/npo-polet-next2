import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { canViewOrderAnalytics } from "../lib/access";
import { OrderAnalytics } from "./OrderAnalytics";

/**
 * Аналитика заказов — /admin/orders/analytics. Сама страница данных не несёт:
 * их отдаёт /api/orders/analytics со своей проверкой прав. Здесь — каркас
 * админки и редирект: кастомные view Payload сами по себе не защищены.
 */
export async function OrderAnalyticsView({
	initPageResult,
	params,
	searchParams,
}: AdminViewServerProps) {
	const { req, locale, permissions, visibleEntities } = initPageResult;
	if (!req.user) {
		redirect("/admin/login?redirect=%2Fadmin%2Forders%2Fanalytics");
	}
	if (!canViewOrderAnalytics(req.user)) {
		redirect("/admin/unauthorized");
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
			<OrderAnalytics />
		</DefaultTemplate>
	);
}
