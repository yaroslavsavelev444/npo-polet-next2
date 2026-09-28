import { sql } from "@payloadcms/db-postgres";
import { Queue, Worker } from "bullmq";
import { ACCOUNT_DELETION_QUEUE } from "../../modules/account-deletion/lib/constants.ts";
import { redisConfig } from "../../modules/auth/lib/redis-config.ts";
import { RESTOCK_QUEUE } from "../../modules/restock/lib/constants.ts";
import {
	type ErrorDigestGroup,
	errorDigestEmailTemplate,
} from "../email/templates/ops/error-digest.template.ts";
import { deliverAlert, sendOpsEmail } from "./delivery.ts";
import { getPayloadForObservability } from "./payload.ts";
import {
	ERROR_ALERT_JOB,
	ERROR_ALERTS_QUEUE,
	ERROR_DIGEST_JOB,
	ensureDigestScheduled,
} from "./queue.ts";
import { markNotified } from "./raw-store.ts";
import { getAlertingSettings } from "./settings.ts";
import type { SafeAlert, Severity } from "./types.ts";

// Обработчик очереди `error-alerts`. Работает в веб-приложении, а не в
// отдельном воркере: из всех процессов проекта выход к SMTP есть только у
// него (см. queue.ts). Запускается из instrumentation.ts.
//
// ⚠ Здесь нельзя вызывать `captureError`: упавшая доставка письма об ошибке
// породила бы письмо об ошибке доставки. Все неудачи — в `console.warn`, а
// задача с исчерпанными попытками остаётся в `failed` и видна в сводке.

const RETENTION_DAYS = (() => {
	const parsed = Number(process.env.ERROR_LOG_RETENTION_DAYS);
	return Number.isFinite(parsed) && parsed >= 1
		? Math.min(Math.trunc(parsed), 400)
		: 90;
})();

const TOP_GROUPS = 10;

/** Очереди, упавшие задачи которых попадают в сводку. */
const WATCHED_QUEUES = [
	ERROR_ALERTS_QUEUE,
	RESTOCK_QUEUE,
	ACCOUNT_DELETION_QUEUE,
];

type DrizzleRows = { rows?: Record<string, unknown>[] };

function rows(result: unknown): Record<string, unknown>[] {
	return (result as DrizzleRows).rows ?? [];
}

async function processAlert(job: {
	data: { alert?: SafeAlert };
	attemptsMade: number;
	opts: { attempts?: number };
}): Promise<string> {
	const alert = job.data.alert;
	if (!alert) return "empty";

	const result = await deliverAlert(alert);
	const target = { errorId: alert.errorId };

	if (result.status === "sent") {
		await markNotified(target, true);
		return "sent";
	}

	const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

	if (result.status === "retryable" && !lastAttempt) {
		// Единственный способ сказать BullMQ «повтори» — бросить.
		throw new Error(result.reason);
	}

	await markNotified(target, false, result.reason);

	if (result.status !== "skipped") {
		console.warn("[observability] alert not delivered", {
			errorId: alert.errorId,
			status: result.status,
			reason: result.reason,
		});
	}

	return result.status;
}

async function countFailedJobs(): Promise<Record<string, number> | null> {
	const counts: Record<string, number> = {};

	for (const name of WATCHED_QUEUES) {
		const queue = new Queue(name, {
			connection: { ...redisConfig, enableOfflineQueue: false },
		});
		queue.on("error", () => {});
		try {
			const result = await queue.getJobCounts("failed");
			counts[name] = result.failed ?? 0;
		} catch {
			return null;
		} finally {
			await queue.close().catch(() => {});
		}
	}

	return counts;
}

/**
 * Суточная сводка и очистка журнала по сроку хранения.
 *
 * Очистка — здесь, а не отдельной задачей: это то же суточное окно, и число
 * удалённых записей видно в той же сводке. Журнал, который незаметно
 * подчищает сам себя, — журнал, которому нельзя доверять.
 */
export async function runDailyDigest(now = new Date()): Promise<string> {
	const payload = await getPayloadForObservability();
	const db = payload.db.drizzle;

	const purgeBefore = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
	const purged = rows(
		await db.execute(sql`
			DELETE FROM error_events WHERE occurred_at < ${purgeBefore.toISOString()}
			RETURNING id
		`),
	).length;

	const settings = await getAlertingSettings();
	if (!settings.dailyDigest) return `purged ${purged}, digest disabled`;

	const since = new Date(now.getTime() - 86_400_000);
	const sinceIso = since.toISOString();

	const totals: Record<Severity, number> = { fatal: 0, error: 0, warning: 0 };
	for (const row of rows(
		await db.execute(sql`
			SELECT severity, count(*)::int AS count
			FROM error_events WHERE occurred_at >= ${sinceIso}
			GROUP BY severity
		`),
	)) {
		const severity = row.severity as Severity;
		if (severity in totals) totals[severity] = Number(row.count);
	}

	// Только очищенные колонки: сводка уходит в почту так же, как письма об
	// ошибках, и группа `raw_*` не выбирается вовсе.
	const groupRows = rows(
		await db.execute(sql`
			SELECT DISTINCT ON (fingerprint)
				fingerprint, severity, error_name, message, module,
				count(*) OVER (PARTITION BY fingerprint)::int AS count,
				max(occurred_at) OVER (PARTITION BY fingerprint) AS last_at
			FROM error_events
			WHERE occurred_at >= ${sinceIso}
			ORDER BY fingerprint, occurred_at DESC
		`),
	);

	const topGroups: ErrorDigestGroup[] = groupRows
		.map((row) => ({
			fingerprint: String(row.fingerprint),
			severity: row.severity as Severity,
			errorName: String(row.error_name),
			message: String(row.message),
			module: row.module ? String(row.module) : null,
			count: Number(row.count),
			lastAt: new Date(String(row.last_at)).toISOString(),
		}))
		.sort((a, b) => b.count - a.count)
		.slice(0, TOP_GROUPS);

	const base = (
		process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
	).replace(/\/$/, "");

	const result = await sendOpsEmail(errorDigestEmailTemplate, {
		environment: process.env.NODE_ENV || "development",
		from: sinceIso,
		to: now.toISOString(),
		totals,
		groupsTotal: groupRows.length,
		topGroups,
		failedJobs: await countFailedJobs(),
		retentionDays: RETENTION_DAYS,
		purged,
		adminUrl: `${base}/admin/collections/error-events`,
	});

	if (result.status === "retryable") throw new Error(result.reason);

	return `purged ${purged}, digest ${result.status}`;
}

type WorkerHolder = { __poletErrorAlertWorker?: Worker };

/**
 * Поднять обработчик. Идемпотентно: в dev модуль перезагружается, а второй
 * обработчик на ту же очередь отправлял бы письма дважды.
 */
export function startAlertWorker(): void {
	const holder = globalThis as WorkerHolder;
	if (holder.__poletErrorAlertWorker) return;

	const worker = new Worker(
		ERROR_ALERTS_QUEUE,
		async (job) => {
			if (job.name === ERROR_ALERT_JOB) return processAlert(job);
			if (job.name === ERROR_DIGEST_JOB) return runDailyDigest();
			return null;
		},
		{ connection: redisConfig, concurrency: 1 },
	);

	let lastConnectionWarning = 0;
	worker.on("error", (error) => {
		// Отказ Redis повторяется на каждой попытке переподключения — в лог
		// раз в минуту, не чаще.
		if (Date.now() - lastConnectionWarning < 60_000) return;
		lastConnectionWarning = Date.now();
		console.warn("[observability] alert worker error", {
			error: error.message,
		});
	});
	worker.on("failed", (job, error) => {
		console.warn("[observability] alert job failed", {
			name: job?.name,
			attemptsMade: job?.attemptsMade,
			error: error?.message,
		});
	});

	holder.__poletErrorAlertWorker = worker;

	void ensureDigestScheduled().catch((error: unknown) => {
		console.warn("[observability] daily digest could not be scheduled", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}
