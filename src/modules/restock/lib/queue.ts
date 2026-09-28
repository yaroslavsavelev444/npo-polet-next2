import { Queue } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import {
	RESTOCK_JOB_DELAY_MS,
	RESTOCK_PRODUCT_JOB,
	RESTOCK_QUEUE,
	RESTOCK_SWEEP_EVERY_MS,
	RESTOCK_SWEEP_JOB,
	RESTOCK_SWEEP_SCHEDULER_ID,
} from "./constants";

export type RestockJob = { productId?: number };

// Очередь создаётся лениво — по той же причине, что и в account-deletion
// (lib/queue.ts): модуль попадает в граф импорта сборки, где Redis нет.
let queue: Queue<RestockJob> | null = null;

function getQueue(): Queue<RestockJob> {
	if (!queue) {
		queue = new Queue<RestockJob>(RESTOCK_QUEUE, {
			// Постановка задачи вызывается из сохранения товара в админке.
			// Без enableOfflineQueue: false при недоступном Redis команда ждала
			// бы переподключения бесконечно (maxRetriesPerRequest: null нужен
			// воркерам), а так — сразу ошибка, которую вызывающий логирует.
			connection: { ...redisConfig, enableOfflineQueue: false },
		});
	}
	return queue;
}

/**
 * Ставит рассылку по товару в очередь.
 *
 * jobId на товар — дедупликация на уровне очереди: пока задача по товару
 * ждёт или выполняется, повторное возвращение в продажу (админ сохранил
 * товар дважды) новую не создаёт. Выполненные задачи удаляются сразу, чтобы
 * следующее возвращение того же товара снова могло поставить задачу.
 */
export async function enqueueRestockNotification(
	productId: number,
): Promise<void> {
	await getQueue().add(
		RESTOCK_PRODUCT_JOB,
		{ productId },
		{
			jobId: `restock-product-${productId}`,
			delay: RESTOCK_JOB_DELAY_MS,
			attempts: 5,
			backoff: { type: "exponential", delay: 30_000 },
			removeOnComplete: true,
			removeOnFail: { age: 24 * 60 * 60 },
		},
	);
}

/** Регистрирует периодический страховочный обход. Идемпотентно. */
export async function ensureRestockSweepScheduled(): Promise<void> {
	await getQueue().upsertJobScheduler(
		RESTOCK_SWEEP_SCHEDULER_ID,
		{ every: RESTOCK_SWEEP_EVERY_MS },
		{
			name: RESTOCK_SWEEP_JOB,
			data: {},
			opts: { removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } },
		},
	);
}

export async function closeRestockQueue(): Promise<void> {
	if (!queue) return;
	await queue.close();
	queue = null;
}
