// Первым: при локальном запуске (pnpm worker:account-deletion) переменные
// берутся из .env; в проде их передаёт compose (env_file), файла в контейнере
// нет, и dotenv ничего не делает — уже заданное он не перезаписывает.
import "dotenv/config";
import { Worker } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { captureError } from "@/services/observability/capture";
import {
	closeObservability,
	flushCaptures,
	installWorkerProcessCapture,
} from "@/services/observability/process";
import {
	ACCOUNT_DELETION_JOB_NAME,
	ACCOUNT_DELETION_QUEUE,
} from "./lib/constants";
import { accountDeletionLogger } from "./lib/logger";
import type { AccountDeletionJob } from "./lib/queue";
import { getAccountDeletionService } from "./lib/service";

installWorkerProcessCapture("account-deletion/worker");

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
	// Окончательный провал: заявка на удаление аккаунта не исполнена, а срок
	// по ней уже истёк. Это требует человека.
	captureError(error, {
		source: "job",
		module: "account-deletion/worker",
		job: {
			queue: ACCOUNT_DELETION_QUEUE,
			name: job.name,
			id: job.id,
			attempt: job.attemptsMade,
			maxAttempts: job.opts.attempts,
		},
		extra: { requestId: job.data.requestId },
	});
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
	await flushCaptures();
	await closeObservability();
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
