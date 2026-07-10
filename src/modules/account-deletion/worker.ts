import { Worker } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import {
	ACCOUNT_DELETION_JOB_NAME,
	ACCOUNT_DELETION_QUEUE,
} from "./lib/constants";
import { accountDeletionLogger } from "./lib/logger";
import type { AccountDeletionJob } from "./lib/queue";
import { getAccountDeletionService } from "./lib/service";

const worker = new Worker<AccountDeletionJob>(
	ACCOUNT_DELETION_QUEUE,
	async (job) => {
		if (job.name !== ACCOUNT_DELETION_JOB_NAME) return;
		const service = await getAccountDeletionService();
		await service.executeDeletion(job.data.requestId);
	},
	{
		connection: redisConfig,
		concurrency: 4,
	},
);

worker.on("completed", (job) => {
	accountDeletionLogger.info("Deletion job completed", {
		requestId: job.data.requestId,
	});
});
worker.on("failed", (job, error) => {
	accountDeletionLogger.error("Deletion job failed", {
		requestId: job?.data.requestId,
		code: error?.name ?? "UNKNOWN",
	});
	if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
	void getAccountDeletionService()
		.then((service) => service.markExecutionFailed(job.data.requestId, error))
		.catch(() => {
			accountDeletionLogger.error("Could not mark deletion request as failed", {
				requestId: job.data.requestId,
			});
		});
});

async function shutdown() {
	await worker.close();
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
