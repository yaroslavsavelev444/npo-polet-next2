// Первым: при локальном запуске (pnpm worker:restock) переменные берутся из
// .env; в проде их передаёт compose (env_file), и файла в контейнере нет —
// dotenv тогда ничего не делает и уже заданное не перезаписывает.
import "dotenv/config";
import { Worker } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { captureError } from "@/services/observability/capture";
import {
	closeObservability,
	flushCaptures,
	installWorkerProcessCapture,
} from "@/services/observability/process";
import {
	RESTOCK_PRODUCT_JOB,
	RESTOCK_QUEUE,
	RESTOCK_SWEEP_JOB,
} from "./lib/constants";
import {
	processRestockForProduct,
	sweepRestockSubscriptions,
} from "./lib/process";
import {
	closeRestockQueue,
	ensureRestockSweepScheduled,
	type RestockJob,
} from "./lib/queue";

/**
 * Воркер уведомлений «товар снова в продаже».
 *
 * Отдельный процесс, а не код внутри сохранения товара: у товара могут быть
 * тысячи подписчиков, и рассылка им не должна держать запрос админки.
 * Запуск: pnpm worker:restock (в проде — сервис restock-worker в
 * docker-compose.prod.yml). Голым Node с резолвером
 * tests/support/next-subpath-resolver.mjs, а не через tsx: под tsx
 * getPayload падает на интеропе @next/env (см. scripts/payload-cli.mts).
 */

// Необработанное исключение — в журнал ошибок и письмом, затем падение, как
// и раньше (Docker поднимет процесс заново).
installWorkerProcessCapture("restock/worker");

const worker = new Worker<RestockJob>(
	RESTOCK_QUEUE,
	async (job) => {
		const payload = await getPayloadInstance();

		if (job.name === RESTOCK_PRODUCT_JOB && job.data.productId) {
			const result = await processRestockForProduct(
				payload,
				job.data.productId,
			);
			return result;
		}
		if (job.name === RESTOCK_SWEEP_JOB) {
			const count = await sweepRestockSubscriptions(payload);
			return { status: "swept", count };
		}
		return null;
	},
	{
		connection: redisConfig,
		// Две задачи одновременно: разные товары не мешают друг другу
		// (FOR UPDATE SKIP LOCKED), а базу параллельные пачки не душат.
		concurrency: 2,
	},
);

worker.on("completed", (job, result) => {
	console.info("[restock] job completed", {
		name: job.name,
		productId: job.data.productId,
		result,
	});
});
worker.on("failed", (job, error) => {
	// В журнал — только окончательный провал: промежуточные попытки BullMQ
	// повторит сам, и письмо о каждой было бы шумом.
	const final = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
	const errorId = final
		? captureError(error, {
				source: "job",
				module: "restock/worker",
				job: {
					queue: RESTOCK_QUEUE,
					name: job?.name,
					id: job?.id,
					attempt: job?.attemptsMade,
					maxAttempts: job?.opts.attempts,
				},
				extra: { productId: job?.data.productId },
			})
		: undefined;
	console.error("[restock] job failed", {
		name: job?.name,
		productId: job?.data.productId,
		attemptsMade: job?.attemptsMade,
		error: error?.message,
		errorId,
	});
});

void ensureRestockSweepScheduled().catch((error) => {
	const errorId = captureError(error, {
		source: "job",
		module: "restock/worker",
		job: { queue: RESTOCK_QUEUE, name: "schedule-sweep" },
	});
	console.error("[restock] could not schedule sweep", error, { errorId });
});

async function shutdown() {
	await worker.close();
	await closeRestockQueue();
	await flushCaptures();
	await closeObservability();
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
