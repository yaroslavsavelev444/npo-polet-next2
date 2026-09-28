import assert from "node:assert/strict";
import { test } from "node:test";
import type { FieldAccess } from "payload";
import { ErrorEvents } from "../../src/payload/collections/ErrorEvents.ts";

/**
 * Гейт персональных данных журнала ошибок: сырая группа видна только
 * суперадминистратору и только в карточке одной записи.
 *
 * Запуск: pnpm test:observability
 */

const DOC = {
	id: 1,
	errorName: "DrizzleQueryError",
	message: "Failed query … params: <redacted>",
	raw: { message: "params: ivan@mail.ru", userId: "4815", ip: "203.0.113.45" },
};

const afterRead = ErrorEvents.hooks?.afterRead?.[0];

function run(findMany: boolean) {
	assert.ok(afterRead);
	return afterRead({
		doc: structuredClone(DOC),
		findMany,
		collection: {} as never,
		context: {},
		req: {} as never,
	}) as Record<string, unknown>;
}

test("в списке сырой группы нет", () => {
	const listed = run(true);
	assert.ok(!("raw" in listed));
	assert.ok(!JSON.stringify(listed).includes("ivan@mail.ru"));
	assert.equal(listed.errorName, "DrizzleQueryError");
});

test("в карточке сырая группа на месте", () => {
	assert.deepEqual(run(false).raw, DOC.raw);
});

test("читать журнал и сырую группу может только суперадминистратор", () => {
	const read = ErrorEvents.access?.read as (args: unknown) => boolean;
	const rawField = ErrorEvents.fields.find(
		(field) => "name" in field && field.name === "raw",
	) as { access?: { read?: FieldAccess } };
	const rawRead = rawField.access?.read as (args: unknown) => boolean;

	const as = (user: unknown) => ({ req: { user } });
	const superadmin = { collection: "admins", role: "superadmin" };
	const admin = { collection: "admins", role: "admin" };
	const customerWithRole = { collection: "users", role: "superadmin" };

	assert.equal(read(as(superadmin)), true);
	assert.equal(rawRead(as(superadmin)), true);
	for (const user of [admin, customerWithRole, null]) {
		assert.equal(read(as(user)), false);
		assert.equal(rawRead(as(user)), false);
	}
});

test("из админки журнал нельзя ни создать, ни править, ни удалить", () => {
	for (const op of ["create", "update", "delete"] as const) {
		const access = ErrorEvents.access?.[op] as (args: unknown) => boolean;
		assert.equal(
			access({ req: { user: { collection: "admins", role: "superadmin" } } }),
			false,
		);
	}
});
