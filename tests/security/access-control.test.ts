import assert from "node:assert/strict";
import { test } from "node:test";
import type { PayloadRequest } from "payload";
import { isAdmin } from "../../src/payload/access/isAdmin.ts";
import {
	isAdminOrSuperAdmin,
	isStaffRole,
} from "../../src/payload/access/isAdminOrSuperAdmin.ts";
import {
	isSuperAdmin,
	isSuperAdminUser,
} from "../../src/payload/access/isSuperAdmin.ts";
import {
	isStaffUser,
	ownedByUserOrStaff,
	staffOnlyField,
} from "../../src/payload/access/ownership.ts";

/**
 * Regression-тесты главной границы авторизации проекта (см. ownership.ts).
 *
 * Историческая ошибка, ради которой они существуют: проверка «это персонал»
 * делалась по одному полю `role`, которое есть и у покупателей (коллекция
 * `users`) как обычные данные. Покупатель с role=superadmin проходил гейты
 * read в Orders/Carts/Sessions и получал коллекции целиком. Единственный
 * достоверный признак — коллекция аккаунта.
 *
 * Запуск: pnpm test:security
 */

type TestUser = { id: number; collection: string; role?: string };

function req(user: TestUser | null): PayloadRequest {
	return { user } as unknown as PayloadRequest;
}

const staff = { id: 1, collection: "admins", role: "admin" };
const superStaff = { id: 2, collection: "admins", role: "superadmin" };
const customer = { id: 10, collection: "users", role: "user" };
// Покупатель, которому удалось выставить себе role персонала.
const impostor = { id: 11, collection: "users", role: "superadmin" };
const impostorAdmin = { id: 12, collection: "users", role: "admin" };
// Аккаунт персонала без роли (или с чужой ролью) — доступа не даёт.
const roleless = { id: 3, collection: "admins" };
const staffWithUserRole = { id: 4, collection: "admins", role: "user" };

test("персоналом считается только аккаунт коллекции admins", () => {
	assert.equal(isStaffUser(staff as never), true);
	assert.equal(isStaffUser(superStaff as never), true);
	assert.equal(isStaffUser(customer as never), false);
	assert.equal(isStaffUser(impostor as never), false);
	assert.equal(isStaffUser(null), false);
});

test("ownedByUserOrStaff: аноним не получает ничего", () => {
	assert.equal(ownedByUserOrStaff({ req: req(null) } as never), false);
});

test("ownedByUserOrStaff: персонал видит всё", () => {
	assert.equal(ownedByUserOrStaff({ req: req(staff) } as never), true);
});

test("ownedByUserOrStaff: покупатель ограничен своими документами", () => {
	assert.deepEqual(ownedByUserOrStaff({ req: req(customer) } as never), {
		user: { equals: 10 },
	});
});

test("ownedByUserOrStaff: role в коллекции users не даёт прав персонала", () => {
	// Ключевой регресс: фильтр обязан остаться персональным, а не стать true.
	assert.deepEqual(ownedByUserOrStaff({ req: req(impostor) } as never), {
		user: { equals: 11 },
	});
});

test("staffOnlyField: служебные поля пишет только персонал", () => {
	assert.equal(staffOnlyField({ req: req(staff) } as never), true);
	assert.equal(staffOnlyField({ req: req(customer) } as never), false);
	assert.equal(staffOnlyField({ req: req(impostor) } as never), false);
	assert.equal(staffOnlyField({ req: req(null) } as never), false);
});

test("ownedByUserOrStaff: аккаунт неизвестной коллекции не получает ничего", () => {
	// Фильтр { user: id } для чужой коллекции совпал бы с документами
	// покупателя с тем же числовым id.
	const stranger = { id: 10, collection: "partners", role: "user" };
	assert.equal(ownedByUserOrStaff({ req: req(stranger) } as never), false);
});

// ── Гейты коллекций: isAdmin / isAdminOrSuperAdmin / isSuperAdmin ──────────

const access = (fn: (args: never) => unknown, user: TestUser | null) =>
	fn({ req: req(user) } as never);

test("isStaffRole: только роли персонала и только строки", () => {
	assert.equal(isStaffRole("admin"), true);
	assert.equal(isStaffRole("superadmin"), true);
	assert.equal(isStaffRole("user"), false);
	assert.equal(isStaffRole(""), false);
	assert.equal(isStaffRole(undefined), false);
	assert.equal(isStaffRole(["admin"]), false);
});

test("isAdminOrSuperAdmin: персонал коллекции admins с ролью персонала", () => {
	assert.equal(access(isAdminOrSuperAdmin, staff), true);
	assert.equal(access(isAdminOrSuperAdmin, superStaff), true);
	assert.equal(access(isAdminOrSuperAdmin, impostor), false);
	assert.equal(access(isAdminOrSuperAdmin, impostorAdmin), false);
	assert.equal(access(isAdminOrSuperAdmin, customer), false);
	assert.equal(access(isAdminOrSuperAdmin, roleless), false);
	assert.equal(access(isAdminOrSuperAdmin, staffWithUserRole), false);
	assert.equal(access(isAdminOrSuperAdmin, null), false);
});

test("isAdmin: только роль admin в коллекции admins", () => {
	assert.equal(access(isAdmin, staff), true);
	assert.equal(access(isAdmin, superStaff), false);
	assert.equal(access(isAdmin, impostorAdmin), false);
	assert.equal(access(isAdmin, roleless), false);
	assert.equal(access(isAdmin, null), false);
});

test("isSuperAdmin: только superadmin в коллекции admins", () => {
	assert.equal(access(isSuperAdmin, superStaff), true);
	assert.equal(access(isSuperAdmin, staff), false);
	assert.equal(access(isSuperAdmin, impostor), false);
	assert.equal(access(isSuperAdmin, null), false);
	assert.equal(isSuperAdminUser(superStaff), true);
	assert.equal(isSuperAdminUser(impostor), false);
	assert.equal(isSuperAdminUser(undefined), false);
});
