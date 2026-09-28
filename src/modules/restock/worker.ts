// Первым: при локальном запуске (pnpm worker:restock) переменные берутся из
// .env; в проде их передаёт compose (env_file), и файла в контейнере нет —
// dotenv тогда ничего не делает и уже заданное не перезаписывает.
import "dotenv/config";
import { Worker } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { getPayloadInstance } from "@/payload/services/getPayload";
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
	console.error("[restock] job failed", {
		name: job?.name,
		productId: job?.data.productId,
		attemptsMade: job?.attemptsMade,
		error: error?.message,
	});
});

void ensureRestockSweepScheduled().catch((error) => {
	console.error("[restock] could not schedule sweep", error);
});

async function shutdown() {
	await worker.close();
	await closeRestockQueue();
	process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
