import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";
import type { CheckoutReceipt } from "@/modules/checkout/types";
import {
	getTransactionDatabase,
	type TransactionDatabase,
} from "./transaction.db";

type StoredAttempt =
	| { state: "created"; receipt: CheckoutReceipt }
	| { state: "closed" }
	| { state: "removed"; orderNumber: string };

export async function withCheckoutTransaction<T>(
	payload: Payload,
	userId: number,
	work: (db: TransactionDatabase, req: Partial<PayloadRequest>) => Promise<T>,
): Promise<T> {
	const transactionID = await payload.db.beginTransaction();
	if (!transactionID)
		throw new Error("Checkout requires a database transaction");

	try {
		const db = getTransactionDatabase(payload, transactionID);
		// Создание и проверка результата сериализуются для одного покупателя.
		await db.execute(
			sql`SELECT pg_advisory_xact_lock(1845793201, ${userId}::integer)`,
		);
		const result = await work(db, { transactionID });
		await payload.db.commitTransaction(transactionID);
		return result;
	} catch (error) {
		await payload.db.rollbackTransaction(transactionID);
		throw error;
	}
}

export async function readCheckoutAttempt(
	db: TransactionDatabase,
	userId: number,
	attemptId: string,
): Promise<StoredAttempt | null> {
	const {
		rows: [attempt],
	} = await db.execute<{
		order_id: number | null;
		receipt: CheckoutReceipt | null;
	}>(sql`
		SELECT order_id, receipt FROM checkout_order_attempts
		WHERE user_id = ${userId} AND attempt_id = ${attemptId}::uuid
	`);
	if (!attempt) return null;
	if (!attempt.receipt) return { state: "closed" };
	if (attempt.order_id === null) {
		return { state: "removed", orderNumber: attempt.receipt.orderNumber };
	}
	return { state: "created", receipt: attempt.receipt };
}

export async function recordCheckoutAttempt(
	db: TransactionDatabase,
	userId: number,
	attemptId: string,
	order?: { id: number; receipt: CheckoutReceipt },
): Promise<void> {
	await db.execute(sql`
		INSERT INTO checkout_order_attempts (user_id, attempt_id, order_id, receipt)
		VALUES (${userId}, ${attemptId}::uuid, ${order?.id ?? null},
			${order ? JSON.stringify(order.receipt) : null}::jsonb)
	`);
}
