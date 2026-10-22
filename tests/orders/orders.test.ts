/**
 * Заказы без базы: путь статусов на странице заказа (status-flow.ts), группы
 * фильтров и что можно сделать с заказом (status.groups.ts), вид статуса
 * (status-view.ts), номер для связи (order-contact.ts).
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	getOrderContact,
	resolveOrderContact,
} from "../../src/modules/orders/lib/order-contact.ts";
import {
	getStatusesForGroup,
	isOrderCancellable,
	isOrderRepeatable,
	isValidFilterGroup,
	ORDER_FILTER_GROUPS,
	ORDER_STATUS_LABELS,
} from "../../src/modules/orders/lib/status.groups.ts";
import { buildOrderTimeline } from "../../src/modules/orders/lib/status-flow.ts";
import {
	isTerminalStatus,
	ORDER_STATUS_VIEW,
} from "../../src/modules/orders/lib/status-view.ts";
import type { OrderStatus } from "../../src/modules/orders/types.ts";

const ALL_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
const at = (n: number) => `2026-10-0${n}T10:00:00.000Z`;
const history = (...statuses: OrderStatus[]) =>
	statuses.map((status, i) => ({
		status,
		changedAt: at(i + 1),
		comment: null,
	}));

const states = (steps: ReturnType<typeof buildOrderTimeline>) =>
	steps.map((s) => `${s.status}:${s.state}`);

describe("путь заказа", () => {
	test("самовывоз: пройденные, текущий, предстоящие; время — из истории", () => {
		const steps = buildOrderTimeline({
			status: "processing",
			deliveryMethod: "self_pickup",
			paymentMethod: "card",
			statusHistory: history("pending", "confirmed", "processing"),
		} as never);
		assert.deepEqual(states(steps), [
			"pending:done",
			"confirmed:done",
			"processing:current",
			"packed:upcoming",
			"ready_for_pickup:upcoming",
			"delivered:upcoming",
		]);
		assert.equal(steps[0].at, at(1));
		assert.equal(steps[3].at, null);
		// Подпись шага сценария важнее общей подписи статуса.
		assert.equal(steps[4].label, "Готов к выдаче");
		assert.equal(steps[5].label, "Получен");
		assert.equal(steps[1].label, ORDER_STATUS_LABELS.confirmed);
	});

	test("доставка до двери и в ПВЗ — свои шаги", () => {
		const door = buildOrderTimeline({
			status: "shipped",
			deliveryMethod: "door_to_door",
			paymentMethod: "card",
			statusHistory: [],
		} as never);
		assert.deepEqual(
			door.map((s) => s.status),
			["pending", "confirmed", "processing", "packed", "shipped", "delivered"],
		);
		const point = buildOrderTimeline({
			status: "ready_for_pickup",
			deliveryMethod: "pickup_point",
			paymentMethod: "card",
			statusHistory: [],
		} as never);
		assert.equal(point.at(-2)?.label, "Прибыл в пункт выдачи");
		assert.equal(point.at(-2)?.state, "current");
	});

	test("оплата по счёту — шаг ожидания счёта сразу после оформления", () => {
		const steps = buildOrderTimeline({
			status: "awaiting_invoice",
			deliveryMethod: "self_pickup",
			paymentMethod: "invoice",
			statusHistory: history("pending"),
		} as never);
		assert.deepEqual(
			steps.slice(0, 3).map((s) => `${s.status}:${s.state}`),
			["pending:done", "awaiting_invoice:current", "confirmed:upcoming"],
		);
	});

	test("неизвестный способ получения — путь самовывоза", () => {
		const steps = buildOrderTimeline({
			status: "pending",
			deliveryMethod: "teleport",
			paymentMethod: "card",
			statusHistory: [],
		} as never);
		assert.equal(steps.at(-2)?.status, "ready_for_pickup");
	});

	test("отменённый: пройденное до отмены и узел отмены, без предстоящих", () => {
		const steps = buildOrderTimeline({
			status: "cancelled",
			deliveryMethod: "door_to_door",
			paymentMethod: "card",
			statusHistory: history("pending", "confirmed", "cancelled"),
		} as never);
		assert.deepEqual(states(steps), [
			"pending:done",
			"confirmed:done",
			"cancelled:cancelled",
		]);
		assert.equal(steps.at(-1)?.label, "Отменён");
		assert.equal(steps.at(-1)?.at, at(3));

		const refunded = buildOrderTimeline({
			status: "refunded",
			deliveryMethod: "door_to_door",
			paymentMethod: "card",
			statusHistory: [],
		} as never);
		assert.deepEqual(states(refunded), ["refunded:cancelled"]);
		assert.equal(refunded[0].label, "Возврат");
	});

	test("статус вне сценария — опора на самый дальний пройденный шаг", () => {
		// ready_for_pickup не входит в путь доставки до двери.
		const steps = buildOrderTimeline({
			status: "ready_for_pickup",
			deliveryMethod: "door_to_door",
			paymentMethod: "card",
			statusHistory: history("pending", "confirmed", "processing"),
		} as never);
		assert.equal(
			steps.find((s) => s.state === "current")?.status,
			"processing",
		);
		const none = buildOrderTimeline({
			status: "ready_for_pickup",
			deliveryMethod: "door_to_door",
			paymentMethod: "card",
			statusHistory: [],
		} as never);
		assert.equal(none[0].state, "current");
	});

	test("время шага — первое достижение статуса", () => {
		const steps = buildOrderTimeline({
			status: "confirmed",
			deliveryMethod: "self_pickup",
			paymentMethod: "card",
			statusHistory: [
				{ status: "pending", changedAt: at(1), comment: null },
				{ status: "confirmed", changedAt: at(2), comment: null },
				{ status: "confirmed", changedAt: at(5), comment: null },
			],
		} as never);
		assert.equal(steps[1].at, at(2));
	});
});

describe("группы и действия", () => {
	test("группы фильтра: «все» без ограничения, остальные — свои статусы", () => {
		assert.equal(getStatusesForGroup("all"), null);
		assert.deepEqual(getStatusesForGroup("completed"), ["delivered"]);
		assert.deepEqual(getStatusesForGroup("cancelled"), [
			"cancelled",
			"refunded",
		]);
		assert.equal(getStatusesForGroup("nope" as never), null);
		// «Текущие» и «Прошедшие» вместе покрывают все статусы и не пересекаются.
		const current = new Set(getStatusesForGroup("current"));
		const past = new Set(getStatusesForGroup("past"));
		for (const status of ALL_STATUSES) {
			assert.ok(current.has(status) !== past.has(status), status);
		}
	});

	test("проверка значения фильтра из адреса", () => {
		for (const { key } of ORDER_FILTER_GROUPS) {
			assert.equal(isValidFilterGroup(key), true);
		}
		assert.equal(isValidFilterGroup(undefined), false);
		assert.equal(isValidFilterGroup("ALL"), false);
		assert.equal(isValidFilterGroup("constructor"), false);
	});

	test("отменить можно только незакрытый; повторить — только закрытый", () => {
		for (const status of ALL_STATUSES) {
			const closed = ["delivered", "cancelled", "refunded"].includes(status);
			assert.equal(isOrderCancellable(status), !closed, status);
			assert.equal(isOrderRepeatable(status), closed, status);
			assert.equal(isTerminalStatus(status), closed, status);
		}
	});

	test("у каждого статуса есть подпись, вид и заголовок", () => {
		for (const status of ALL_STATUSES) {
			assert.ok(ORDER_STATUS_LABELS[status], status);
			assert.ok(ORDER_STATUS_VIEW[status]?.headline, status);
			assert.ok(ORDER_STATUS_VIEW[status]?.hint, status);
		}
	});
});

describe("номер для связи по заказу", () => {
	test("выбор покупателя соблюдается, пробелы обрезаются", () => {
		assert.deepEqual(
			resolveOrderContact({
				customerPhone: " +7 900 000-00-01 ",
				recipientPhone: "+7 900 000-00-02",
				preferred: "recipient",
			}),
			{
				phone: "+7 900 000-00-02",
				owner: "recipient",
				customerPhone: "+7 900 000-00-01",
				recipientPhone: "+7 900 000-00-02",
				hasSeparateRecipientPhone: true,
			},
		);
	});

	test("выбранного номера нет — берём другой; нет ни одного — пусто", () => {
		const onlyCustomer = resolveOrderContact({
			customerPhone: "+71",
			preferred: "recipient",
		});
		assert.equal(onlyCustomer.owner, "customer");
		assert.equal(onlyCustomer.phone, "+71");
		const onlyRecipient = resolveOrderContact({
			recipientPhone: "+72",
			preferred: "customer",
		});
		assert.equal(onlyRecipient.owner, "recipient");
		assert.equal(onlyRecipient.phone, "+72");
		const none = resolveOrderContact({ preferred: "customer" });
		assert.equal(none.owner, null);
		assert.equal(none.phone, "");
		assert.equal(resolveOrderContact({ preferred: "recipient" }).owner, null);
	});

	test("исторический заказ без выбора: номер заказчика, иначе получателя", () => {
		assert.equal(
			resolveOrderContact({ customerPhone: "+71" }).owner,
			"customer",
		);
		assert.equal(
			resolveOrderContact({ recipientPhone: "+72", preferred: "мусор" }).owner,
			"recipient",
		);
	});

	test("совпадающий номер получателя — не «отдельный»", () => {
		assert.equal(
			resolveOrderContact({ customerPhone: "+71", recipientPhone: "+71" })
				.hasSeparateRecipientPhone,
			false,
		);
		assert.equal(
			resolveOrderContact({ customerPhone: "+71" }).hasSeparateRecipientPhone,
			false,
		);
	});

	test("снимок номера в заказе важнее пересчёта", () => {
		const contact = getOrderContact({
			recipient: { phone: "+72" },
			contact: { customerPhone: "+71", preferred: "customer", phone: " +79 " },
		});
		assert.equal(contact.phone, "+79");
		assert.equal(contact.owner, "customer");
		assert.equal(
			getOrderContact({ recipient: { phone: "+72" }, contact: null }).phone,
			"+72",
		);
		assert.equal(getOrderContact({}).phone, "");
	});
});
