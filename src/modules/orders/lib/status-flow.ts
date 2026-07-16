import type { Order } from "@/payload-types";
import type { OrderStatus, OrderStatusHistoryEntry } from "../types";
import { ORDER_STATUS_LABELS } from "./status.groups";

/**
 * Сценарии timeline статусов заказа.
 *
 * Разные способы получения проходят разный «счастливый путь», поэтому каждый
 * сценарий описан отдельной последовательностью шагов. Структура намеренно
 * декларативная (`SCENARIO_FLOWS` + модификаторы) — новый сценарий добавляется
 * одной записью, без изменения UI-компонента [[OrderTimeline]].
 */

export type TimelineState = "done" | "current" | "upcoming" | "cancelled";

type DeliveryMethod = Order["delivery"]["method"];
type PaymentMethod = Order["payment"]["method"];

interface FlowStep {
	status: OrderStatus;
	/** Подпись шага для сценария (переопределяет ORDER_STATUS_LABELS). */
	label?: string;
	/** Короткое пояснение, что означает шаг. */
	description: string;
}

export interface TimelineStep {
	status: OrderStatus;
	label: string;
	description: string;
	state: TimelineState;
	/** Момент достижения статуса (из истории) или `null`. */
	at: string | null;
}

const STEP_PENDING: FlowStep = {
	status: "pending",
	description: "Заказ оформлен и ожидает подтверждения",
};
const STEP_CONFIRMED: FlowStep = {
	status: "confirmed",
	description: "Менеджер подтвердил заказ",
};
const STEP_PROCESSING: FlowStep = {
	status: "processing",
	description: "Заказ собирается на складе",
};
const STEP_PACKED: FlowStep = {
	status: "packed",
	description: "Заказ упакован и готов к отправке",
};

/**
 * Ключ сценария — способ получения. Каждый массив описывает полный путь заказа
 * от оформления до вручения.
 */
const SCENARIO_FLOWS: Record<DeliveryMethod, FlowStep[]> = {
	// Самовывоз из нашего пункта: без отправки — сразу готовность к выдаче.
	self_pickup: [
		STEP_PENDING,
		STEP_CONFIRMED,
		STEP_PROCESSING,
		STEP_PACKED,
		{
			status: "ready_for_pickup",
			label: "Готов к выдаче",
			description: "Заказ ждёт вас в пункте самовывоза",
		},
		{ status: "delivered", label: "Получен", description: "Заказ получен" },
	],
	// Курьером до двери: упаковка → отправка → доставка.
	door_to_door: [
		STEP_PENDING,
		STEP_CONFIRMED,
		STEP_PROCESSING,
		STEP_PACKED,
		{
			status: "shipped",
			description: "Заказ передан курьеру",
		},
		{ status: "delivered", description: "Заказ доставлен по адресу" },
	],
	// В ПВЗ транспортной компании: отправка → прибытие в пункт → выдача.
	pickup_point: [
		STEP_PENDING,
		STEP_CONFIRMED,
		STEP_PROCESSING,
		STEP_PACKED,
		{
			status: "shipped",
			description: "Заказ передан в транспортную компанию",
		},
		{
			status: "ready_for_pickup",
			label: "Прибыл в пункт выдачи",
			description: "Заказ можно забрать в пункте выдачи",
		},
		{ status: "delivered", label: "Получен", description: "Заказ получен" },
	],
};

const STEP_AWAITING_INVOICE: FlowStep = {
	status: "awaiting_invoice",
	description: "Ожидает выставления счёта и оплаты",
};

const CANCELLED_STEP: Record<
	Extract<OrderStatus, "cancelled" | "refunded">,
	{ label: string; description: string }
> = {
	cancelled: { label: "Отменён", description: "Заказ был отменён" },
	refunded: { label: "Возврат", description: "По заказу оформлен возврат" },
};

function isTerminal(status: OrderStatus): status is "cancelled" | "refunded" {
	return status === "cancelled" || status === "refunded";
}

/**
 * Строит последовательность шагов сценария с учётом способа оплаты. Для оплаты
 * по счёту после оформления добавляется шаг ожидания счёта.
 */
function resolveFlow(
	deliveryMethod: DeliveryMethod,
	paymentMethod: PaymentMethod,
): FlowStep[] {
	const base = SCENARIO_FLOWS[deliveryMethod] ?? SCENARIO_FLOWS.self_pickup;
	if (paymentMethod !== "invoice") return base;
	// Вставляем ожидание счёта сразу после «Ожидает подтверждения».
	return [base[0], STEP_AWAITING_INVOICE, ...base.slice(1)];
}

function stepLabel(step: FlowStep): string {
	return step.label ?? ORDER_STATUS_LABELS[step.status];
}

function buildHistoryMap(
	history: OrderStatusHistoryEntry[],
): Map<OrderStatus, string | null> {
	const map = new Map<OrderStatus, string | null>();
	for (const entry of history) {
		// Первое достижение статуса — самое информативное.
		if (!map.has(entry.status)) map.set(entry.status, entry.changedAt);
	}
	return map;
}

export interface BuildTimelineInput {
	status: OrderStatus;
	deliveryMethod: DeliveryMethod;
	paymentMethod: PaymentMethod;
	statusHistory: OrderStatusHistoryEntry[];
}

/**
 * Собирает timeline: пройденные шаги, текущий и предстоящие. Для отменённых
 * заказов путь обрывается достигнутыми шагами и завершается терминальным узлом.
 */
export function buildOrderTimeline({
	status,
	deliveryMethod,
	paymentMethod,
	statusHistory,
}: BuildTimelineInput): TimelineStep[] {
	const flow = resolveFlow(deliveryMethod, paymentMethod);
	const historyMap = buildHistoryMap(statusHistory);
	const reachedInFlow = flow
		.map((step, index) => (historyMap.has(step.status) ? index : -1))
		.filter((index) => index >= 0);
	const currentIndex = flow.findIndex((step) => step.status === status);

	if (isTerminal(status)) {
		// Показываем достигнутые шаги как пройденные и добавляем терминальный узел.
		const lastReached = reachedInFlow.length ? Math.max(...reachedInFlow) : -1;
		const doneSteps: TimelineStep[] = flow
			.slice(0, lastReached + 1)
			.map((step) => ({
				status: step.status,
				label: stepLabel(step),
				description: step.description,
				state: "done" as const,
				at: historyMap.get(step.status) ?? null,
			}));

		const terminal = CANCELLED_STEP[status];
		doneSteps.push({
			status,
			label: terminal.label,
			description: terminal.description,
			state: "cancelled",
			at: historyMap.get(status) ?? null,
		});
		return doneSteps;
	}

	// Активный путь. Если статуса нет в потоке (легаси/нестандартный), опираемся
	// на самый дальний достигнутый шаг, чтобы не сломать отображение.
	const effectiveIndex =
		currentIndex >= 0
			? currentIndex
			: reachedInFlow.length
				? Math.max(...reachedInFlow)
				: 0;

	return flow.map((step, index) => {
		let state: TimelineState;
		if (index < effectiveIndex) state = "done";
		else if (index === effectiveIndex) state = "current";
		else state = "upcoming";

		return {
			status: step.status,
			label: stepLabel(step),
			description: step.description,
			state,
			at: historyMap.get(step.status) ?? null,
		};
	});
}
