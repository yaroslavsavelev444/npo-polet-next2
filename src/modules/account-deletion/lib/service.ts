import { createHmac } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { env } from "@/env";
import { getPayloadInstance } from "@/payload/services/getPayload";
import {
	ACCOUNT_DELETION_COOLING_OFF_MS,
	ACCOUNT_DELETION_LEASE_MS,
} from "./constants";
import { accountDeletionLogger } from "./logger";
import {
	cancelScheduledAccountDeletion,
	scheduleAccountDeletion,
} from "./queue";

type DeletionStatus =
	| "pending"
	| "cancelled"
	| "executing"
	| "completed"
	| "failed";

type DeletionRequestRow = {
	id: number;
	status: DeletionStatus;
	scheduled_for: Date | string;
};

export type AccountDeletionView = {
	id: string;
	status: DeletionStatus;
	requestedAt: string;
	scheduledFor: string;
	cancelledAt?: string;
	executedAt?: string;
	lastErrorCode?: string;
};

export class AccountDeletionError extends Error {
	constructor(
		message: string,
		readonly code:
			| "ALREADY_PENDING"
			| "NOT_CANCELLABLE"
			| "REQUEST_NOT_FOUND"
			| "INVALID_PASSWORD",
	) {
		super(message);
	}
}

function toView(row: Record<string, unknown>): AccountDeletionView {
	return {
		id: String(row.id),
		status: row.status as DeletionStatus,
		requestedAt: new Date(row.requested_at as string).toISOString(),
		scheduledFor: new Date(row.scheduled_for as string).toISOString(),
		cancelledAt: row.cancelled_at
			? new Date(row.cancelled_at as string).toISOString()
			: undefined,
		executedAt: row.executed_at
			? new Date(row.executed_at as string).toISOString()
			: undefined,
		lastErrorCode: (row.last_error_code as string | null) ?? undefined,
	};
}

function subjectReference(userId: number | string) {
	return createHmac(
		"sha256",
		process.env.ACCOUNT_DELETION_AUDIT_SECRET ?? env.PAYLOAD_SECRET,
	)
		.update(`account-deletion:${userId}`)
		.digest("hex");
}

function getRows(result: unknown): DeletionRequestRow[] {
	return (result as { rows?: DeletionRequestRow[] }).rows ?? [];
}

function errorCode(error: unknown): string {
	if (error && typeof error === "object" && "code" in error) {
		return String(error.code).slice(0, 80);
	}
	return "ACCOUNT_DELETION_EXECUTION_FAILED";
}

/**
 * Application service. Direct SQL is intentionally confined here: it gives us
 * conditional state changes and one DB transaction across all related tables,
 * which the generic collection API cannot make atomic.
 */
export class AccountDeletionService {
	constructor(private readonly payload: Payload) {}

	async getCurrentRequest(
		userId: number | string,
	): Promise<AccountDeletionView | null> {
		const result = await this.payload.db.drizzle.execute(sql`
      SELECT id, status, requested_at, scheduled_for, cancelled_at, executed_at, last_error_code
      FROM account_deletion_requests
      WHERE user_id = ${Number(userId)}
      ORDER BY created_at DESC
      LIMIT 1
    `);
		const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0];
		return row ? toView(row) : null;
	}

	async requestDeletion(input: {
		userId: number | string;
		email: string;
		password: string;
	}): Promise<AccountDeletionView> {
		// Re-authentication protects a destructive action even if the browser
		// session has been hijacked. Do not leak whether a user exists.
		const login = await this.payload.login({
			collection: "users",
			data: { email: input.email, password: input.password },
		});
		if (!login.user || String(login.user.id) !== String(input.userId)) {
			throw new AccountDeletionError("Неверный пароль", "INVALID_PASSWORD");
		}

		const now = new Date();
		const scheduledFor = new Date(
			now.getTime() + ACCOUNT_DELETION_COOLING_OFF_MS,
		);
		let result: unknown;
		try {
			result = await this.payload.db.drizzle.execute(sql`
      INSERT INTO account_deletion_requests (
        user_id, subject_reference, status, requested_at, scheduled_for,
        retention_justification, execution_attempts, created_at, updated_at
      ) VALUES (
        ${Number(input.userId)}, ${subjectReference(input.userId)}, 'pending',
        ${now.toISOString()}, ${scheduledFor.toISOString()},
        'Минимальный журнал исполнения права субъекта данных; персональные данные и связь с аккаунтом удаляются после завершения.',
        0, NOW(), NOW()
      )
      RETURNING id, status, requested_at, scheduled_for, cancelled_at, executed_at, last_error_code
    `);
		} catch (error) {
			// Partial unique index is the source of truth under concurrent requests.
			if (errorCode(error) === "23505") {
				throw new AccountDeletionError(
					"Активная заявка уже существует",
					"ALREADY_PENDING",
				);
			}
			throw error;
		}

		const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0];
		if (!row) {
			throw new Error("Не удалось создать заявку на удаление аккаунта");
		}

		try {
			await scheduleAccountDeletion(
				Number(row.id),
				scheduledFor.getTime() - now.getTime(),
			);
		} catch (error) {
			// The row is durable. Marking it failed makes the missing asynchronous
			// hand-off visible to staff instead of silently promising a deletion.
			await this.payload.db.drizzle.execute(sql`
        UPDATE account_deletion_requests
        SET status = 'failed', last_error_code = 'QUEUE_SCHEDULING_FAILED', updated_at = NOW()
        WHERE id = ${Number(row.id)} AND status = 'pending'
      `);
			accountDeletionLogger.error("Could not schedule deletion", {
				requestId: Number(row.id),
				code: errorCode(error),
			});
			throw new Error("Не удалось запланировать заявку. Попробуйте ещё раз.");
		}

		accountDeletionLogger.info("Deletion request scheduled", {
			requestId: Number(row.id),
		});
		return toView(row);
	}

	async cancelDeletion(userId: number | string, requestId: number | string) {
		const result = await this.payload.db.drizzle.execute(sql`
      UPDATE account_deletion_requests
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(), last_error_code = NULL
      WHERE id = ${Number(requestId)}
        AND user_id = ${Number(userId)}
        AND status = 'pending'
        AND scheduled_for > NOW()
      RETURNING id, status, requested_at, scheduled_for, cancelled_at, executed_at, last_error_code
    `);
		const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0];
		if (!row) {
			throw new AccountDeletionError(
				"Заявку уже нельзя отменить",
				"NOT_CANCELLABLE",
			);
		}
		await cancelScheduledAccountDeletion(Number(row.id));
		accountDeletionLogger.info("Deletion request cancelled", {
			requestId: Number(row.id),
		});
		return toView(row);
	}

	/** Called only by the BullMQ worker. The UPDATE...RETURNING is the lease. */
	async executeDeletion(requestId: number): Promise<void> {
		const leaseUntil = new Date(Date.now() + ACCOUNT_DELETION_LEASE_MS);
		const claimed = await this.payload.db.drizzle.execute(sql`
      UPDATE account_deletion_requests
      SET status = 'executing',
          execution_lease_until = ${leaseUntil.toISOString()},
          execution_attempts = execution_attempts + 1,
          last_error_code = NULL,
          updated_at = NOW()
      WHERE id = ${requestId}
        AND (
          (status = 'pending' AND scheduled_for <= NOW())
          OR (status = 'executing' AND execution_lease_until <= NOW())
        )
      RETURNING id, user_id
    `);
		const row = getRows(claimed)[0] as
			| (DeletionRequestRow & { user_id: number | null })
			| undefined;
		if (!row || !row.user_id) return; // cancelled, already done, or held by another worker

		const userId = Number(row.user_id);
		try {
			await this.anonymizeAndDeleteUser(userId, requestId);
			accountDeletionLogger.info("Account deletion completed", { requestId });
		} catch (error) {
			await this.payload.db.drizzle.execute(sql`
        UPDATE account_deletion_requests
        SET status = 'pending', execution_lease_until = NULL,
            last_error_code = ${errorCode(error)}, updated_at = NOW()
        WHERE id = ${requestId} AND status = 'executing'
      `);
			accountDeletionLogger.error("Account deletion failed; retrying", {
				requestId,
				code: errorCode(error),
			});
			throw error;
		}
	}

	/** Called once BullMQ has exhausted all automatic retry attempts. */
	async markExecutionFailed(requestId: number, cause: unknown): Promise<void> {
		await this.payload.db.drizzle.execute(sql`
      UPDATE account_deletion_requests
      SET status = 'failed', execution_lease_until = NULL,
          last_error_code = ${errorCode(cause)}, updated_at = NOW()
      WHERE id = ${requestId} AND status = 'pending'
    `);
	}

	private async anonymizeAndDeleteUser(userId: number, requestId: number) {
		await this.payload.db.drizzle.transaction(async (tx) => {
			// Data not subject to statutory retention: remove it outright.
			await tx.execute(sql`DELETE FROM carts WHERE user_id = ${userId}`);
			await tx.execute(sql`DELETE FROM wishlists WHERE user_id = ${userId}`);
			await tx.execute(
				sql`DELETE FROM checkout_preferences WHERE user_id = ${userId}`,
			);
			await tx.execute(
				sql`DELETE FROM notifications WHERE user_id = ${userId}`,
			);
			await tx.execute(sql`DELETE FROM otp_codes WHERE user_id = ${userId}`);
			await tx.execute(sql`DELETE FROM sessions WHERE user_id = ${userId}`);
			await tx.execute(
				sql`DELETE FROM user_consents WHERE user_id = ${userId}`,
			);
			await tx.execute(
				sql`DELETE FROM product_reviews WHERE user_id = ${userId}`,
			);
			await tx.execute(sql`DELETE FROM feedbacks WHERE user_id = ${userId}`);
			await tx.execute(sql`DELETE FROM companies WHERE user_id = ${userId}`);

			// Orders are retained for accounting. The transactional amounts and order
			// number remain; every account/recipient/contact/device field is removed.
			await tx.execute(sql`
        UPDATE orders
        SET user_id = NULL,
            recipient_full_name = 'Удалено по запросу субъекта данных',
            recipient_phone = '',
            recipient_email = CONCAT('deleted-order-', id, '@example.invalid'),
            recipient_contact_person = NULL,
            delivery_address_street = NULL,
            delivery_address_city = NULL,
            delivery_address_postal_code = NULL,
            delivery_address_country = NULL,
            delivery_notes = NULL,
            company_info_contact_person = NULL,
            notes = NULL,
            ip_address = NULL,
            user_agent = NULL,
            updated_at = NOW()
        WHERE user_id = ${userId}
      `);

			// Existing cancelled/failed requests are also detached before deleting the
			// user. The retained HMAC is not reversible to an account identifier.
			await tx.execute(sql`
        UPDATE account_deletion_requests SET user_id = NULL, updated_at = NOW()
        WHERE user_id = ${userId}
      `);
			await tx.execute(sql`DELETE FROM users WHERE id = ${userId}`);
			await tx.execute(sql`
        UPDATE account_deletion_requests
        SET status = 'completed', executed_at = NOW(), execution_lease_until = NULL,
            last_error_code = NULL, updated_at = NOW()
        WHERE id = ${requestId}
      `);
		});
	}
}

export async function getAccountDeletionService() {
	return new AccountDeletionService(await getPayloadInstance());
}
