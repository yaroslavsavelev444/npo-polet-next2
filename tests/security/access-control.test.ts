import assert from "node:assert/strict";
import { test } from "node:test";
import type { PayloadRequest } from "payload";
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
