// src/payload/access/isAdminOrSuperAdmin.ts
import type { Access } from "payload";

/**
 * Роли персонала, имеющего доступ к админ-панели Payload.
 *
 * Единый источник правды: этим же списком отбираются получатели служебных
 * писем (см. src/services/email/recipients/getAdminEmails.ts). Держать
 * список в двух местах нельзя — добавив третью роль в коллекцию `admins`,
 * легко забыть про рассылку и наоборот.
 */
export const STAFF_ROLES = ["admin", "superadmin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Доступ к панели даёт принадлежность к коллекции `admins`, а не поле role. */
export const STAFF_COLLECTION = "admins";

export const isStaffRole = (role: unknown): role is StaffRole =>
	typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role);

export const isAdminOrSuperAdmin: Access = ({ req }) => {
	return (
		req.user?.collection === STAFF_COLLECTION && isStaffRole(req.user.role)
	);
};
