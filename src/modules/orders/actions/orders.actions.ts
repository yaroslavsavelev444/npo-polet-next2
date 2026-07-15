"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import {
	cancelOrderForUser,
	getOrderByIdForUser,
} from "@/payload/services/orders.service";
import { mapOrderToDetailView } from "../lib/build-order-list-view";
import type { CancelOrderResult, OrderDetailResult } from "../types";

export async function cancelOrderAction(
	orderId: string,
	reason: string,
): Promise<CancelOrderResult> {
	const user = await getCurrentUser();
	if (!user) {
		return {
			success: false,
			error: "AUTH_REQUIRED",
			message: "Войдите в аккаунт",
		};
	}

	const trimmedReason = reason.trim();
	if (trimmedReason.length < 5) {
		return {
			success: false,
			error: "VALIDATION_ERROR",
			message: "Укажите причину отмены (минимум 5 символов)",
		};
	}

	const result = await cancelOrderForUser(
		orderId,
		String(user.id),
		trimmedReason,
	);

	if (!result.ok) {
		if (result.reason === "not_found") {
			return { success: false, error: "NOT_FOUND", message: "Заказ не найден" };
		}
		return {
			success: false,
			error: "NOT_CANCELLABLE",
			message: "Этот заказ уже нельзя отменить",
		};
	}

	revalidatePath("/orders");

	return { success: true, data: { status: result.status } };
}

export async function getOrderDetailAction(
	orderId: string,
): Promise<OrderDetailResult> {
	const user = await getCurrentUser();
	if (!user) {
		return { success: false, message: "Войдите в аккаунт" };
	}

	const order = await getOrderByIdForUser(orderId, String(user.id));
	if (!order) {
		return { success: false, message: "Заказ не найден" };
	}

	return { success: true, data: mapOrderToDetailView(order) };
}
