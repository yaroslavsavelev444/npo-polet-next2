import {
	isStaffRole,
	STAFF_COLLECTION,
} from "../../../payload/access/isAdminOrSuperAdmin.ts";

type MaybeStaff = { collection?: string; role?: unknown } | null | undefined;

/**
 * Кому видна аналитика заказов: персонал с доступом к админке — то же правило,
 * что isAdminOrSuperAdmin на записи заказов. Одна функция на страницу, кнопку
 * и эндпоинт: скрыть кнопку и забыть про данные здесь невозможно.
 *
 * Покупатель с role=superadmin сюда не проходит: решает коллекция учётной
 * записи, а не только поле role (см. комментарий к read в Orders.ts).
 */
export function canViewOrderAnalytics(user: MaybeStaff): boolean {
	return user?.collection === STAFF_COLLECTION && isStaffRole(user.role);
}
