// src/payload/access/isSuperAdmin.ts
import type { Access } from "payload";
import { STAFF_COLLECTION } from "./isAdminOrSuperAdmin.ts";

type MaybeStaff = { collection?: string; role?: unknown } | null | undefined;

/**
 * Суперадминистратор — старшая роль персонала.
 *
 * Отдельно от isAdminOrSuperAdmin для экранов, где видны персональные данные
 * не одного покупателя, а всех подряд (журнал серверных ошибок): такой
 * доступ не должен доставаться сотруднику только потому, что у него есть
 * вход в админку.
 */
export const isSuperAdminUser = (user: MaybeStaff): boolean =>
	user?.collection === STAFF_COLLECTION && user.role === "superadmin";

export const isSuperAdmin: Access = ({ req }) => isSuperAdminUser(req.user);
