import { Queue } from "bullmq";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { ACCOUNT_DELETION_JOB_NAME, ACCOUNT_DELETION_QUEUE } from "./constants";

export type AccountDeletionJob = { requestId: number };

// ⚠ Очередь создаётся ЛЕНИВО, при первом обращении, а не на импорте модуля.
//
// Конструктор BullMQ.Queue сразу открывает соединение с Redis (в отличие от
// ioredis, где есть lazyConnect). Модуль импортируется из lib/service.ts,
// который тянет за собой app/(frontend)/profile/delete-account/page.tsx, —
// а значит, на этапе `next build` («Collecting page data») Next импортировал
// его в сборочном контейнере, где Redis нет. Каждая сборка печатала в лог
//
//   AggregateError: ... connect ECONNREFUSED 127.0.0.1:6379
//
// и шла дальше: ошибка ничего не ломала, но и не значила ничего — просто
// сборка стучалась в сервис, которого на ней быть не должно. Ленивое
// создание убирает и стук, и запись в логе: очередь открывается только тогда,
// когда её действительно просят поставить или снять задачу.
let queue: Queue<AccountDeletionJob> | null = null;

function getQueue(): Queue<AccountDeletionJob> {
	if (!queue) {
		queue = new Queue<AccountDeletionJob>(ACCOUNT_DELETION_QUEUE, {
			connection: redisConfig,
		});
	}
	return queue;
}

/**
 * Id задачи по заявке — без двоеточия: BullMQ 5 отвергает пользовательский
 * jobId с «:» (он служебный разделитель ключей Redis), и заявка уходила в
 * failed / QUEUE_SCHEDULING_FAILED. Один на заявку — повторная постановка
 * не создаёт вторую задачу, а отмена находит именно её.
 */
export function accountDeletionJobId(requestId: number): string {
	return `account-deletion-${requestId}`;
}

export async function scheduleAccountDeletion(
	requestId: number,
	delay: number,
): Promise<void> {
	await getQueue().add(
		ACCOUNT_DELETION_JOB_NAME,
		{ requestId },
		{
			jobId: accountDeletionJobId(requestId),
			delay,
			attempts: 8,
			backoff: { type: "exponential", delay: 60_000 },
			removeOnComplete: { age: 7 * 24 * 60 * 60 },
			removeOnFail: false,
		},
	);
}

export async function cancelScheduledAccountDeletion(requestId: number) {
	const job = await getQueue().getJob(accountDeletionJobId(requestId));
	await job?.remove();
}

export async function closeAccountDeletionQueue() {
	// Если очередь так и не понадобилась, закрывать нечего — и открывать ради
	// закрытия тем более не нужно.
	if (!queue) return;
	await queue.close();
	queue = null;
}
