import type { User } from "payload";
import { canViewOrderAnalytics } from "../lib/access";
import { AnalyticsLinkButton } from "./AnalyticsLinkButton";

/**
 * Кнопка на списке заказов — единственный вход на страницу аналитики. Прав
 * она не даёт, только не показывается тем, кому эндпоинт всё равно откажет.
 */
export function OrderAnalyticsButton({ user }: { user?: User | null }) {
	if (!canViewOrderAnalytics(user)) return null;
	return <AnalyticsLinkButton />;
}
