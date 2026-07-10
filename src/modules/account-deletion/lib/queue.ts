import { Queue } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { ACCOUNT_DELETION_JOB_NAME, ACCOUNT_DELETION_QUEUE } from "./constants";

export type AccountDeletionJob = { requestId: number };

const queue = new Queue<AccountDeletionJob>(ACCOUNT_DELETION_QUEUE, {
	connection: redisConfig,
});

export async function scheduleAccountDeletion(
	requestId: number,
	delay: number,
): Promise<void> {
	await queue.add(
		ACCOUNT_DELETION_JOB_NAME,
		{ requestId },
		{
			jobId: `account-deletion:${requestId}`,
			delay,
			attempts: 8,
			backoff: { type: "exponential", delay: 60_000 },
			removeOnComplete: { age: 7 * 24 * 60 * 60 },
			removeOnFail: false,
		},
	);
}

export async function cancelScheduledAccountDeletion(requestId: number) {
	const job = await queue.getJob(`account-deletion:${requestId}`);
	await job?.remove();
}

export async function closeAccountDeletionQueue() {
	await queue.close();
}
