import { Queue } from "bullmq";
import { redisConfig } from "../../modules/auth/lib/redis-config.ts";
import type { SafeAlert } from "./types.ts";

// Очередь писем об ошибках.
//
// ─── Зачем очередь, если EmailService и так делает ретраи ───────────────────
//
// Две причины, обе про то, где письмо отправляется, а не как:
//
//  1. restock-worker стоит только в сети `data`, без выхода наружу
//     (docker-compose.prod.yml) — письмо из него до SMTP не дойдёт. Ошибка,
//     пойманная воркером, ставится сюда, а отправляет её веб-приложение
//     (`alert-worker.ts`), у которого выход в интернет есть.
//  2. Задача переживает перезапуск процесса, который отправку бы не пережил,
//     — а падение процесса и есть самый частый повод для письма.
//
// В очередь кладётся только `SafeAlert`: Redis — не место для персональных
// данных покупателей, даже временно.

export const ERROR_ALERTS_QUEUE = "error-alerts";
export const ERROR_ALERT_JOB = "alert";
export const ERROR_DIGEST_JOB = "daily-digest";
export const ERROR_DIGEST_SCHEDULER_ID = "error-daily-digest";

/** Ждать постановки дольше этого — значит, Redis лежит. */
const ENQUEUE_TIMEOUT_MS = 3_000;

type AlertJob = { alert: SafeAlert } | Record<string, never>;

let queue: Queue<AlertJob> | null = null;

function getQueue(): Queue<AlertJob> {
	if (!queue) {
		queue = new Queue<AlertJob>(ERROR_ALERTS_QUEUE, {
			// Без офлайн-очереди команда при недоступном Redis падает сразу, а не
			// ждёт восстановления — тогда письмо уходит прямо из процесса.
			connection: { ...redisConfig, enableOfflineQueue: false },
		});
		queue.on("error", () => {});
	}
	return queue;
}

/**
 * Поставить письмо в очередь. `false` — Redis недоступен, отправлять нужно
 * самому. Не бросает.
 */
export async function enqueueAlert(alert: SafeAlert): Promise<boolean> {
	let timer: NodeJS.Timeout | undefined;

	try {
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error("enqueue timeout")),
				ENQUEUE_TIMEOUT_MS,
			);
		});

		await Promise.race([
			getQueue().add(
				ERROR_ALERT_JOB,
				{ alert },
				{
					// errorId — идемпотентность: повторная постановка того же
					// происшествия не даст второго письма.
					jobId: alert.errorId,
					attempts: 3,
					backoff: { type: "exponential", delay: 30_000 },
					removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
					removeOnFail: { age: 30 * 24 * 60 * 60 },
				},
			),
			timeout,
		]);

		return true;
	} catch {
		return false;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** Суточная сводка: 09:00 по Москве. Идемпотентно. */
export async function ensureDigestScheduled(): Promise<void> {
	await getQueue().upsertJobScheduler(
		ERROR_DIGEST_SCHEDULER_ID,
		{ pattern: "0 9 * * *", tz: "Europe/Moscow" },
		{
			name: ERROR_DIGEST_JOB,
			data: {},
			opts: {
				attempts: 3,
				backoff: { type: "exponential", delay: 60_000 },
				removeOnComplete: { age: 30 * 24 * 60 * 60 },
				removeOnFail: { age: 30 * 24 * 60 * 60 },
			},
		},
	);
}

export async function closeAlertQueue(): Promise<void> {
	if (!queue) return;
	const current = queue;
	queue = null;
	await current.close().catch(() => {});
}
