import { randomUUID } from "node:crypto";
import { hostname as osHostname } from "node:os";
import { deliverAlert, getAlertRecipients } from "./delivery.ts";
import { computeFingerprint } from "./fingerprint.ts";
import { isClientFault, normalizeError } from "./normalize.ts";
import { evaluate } from "./policy.ts";
import { enqueueAlert } from "./queue.ts";
import { markNotified, recordErrorEvent } from "./raw-store.ts";
import { toSafeAlert } from "./safe-payload.ts";
import { getAlertingSettings } from "./settings.ts";
import type { CaptureContext, ErrorEvent, ProcessName } from "./types.ts";
import { defaultSeverity } from "./types.ts";

// Фасад системы сбора ошибок. Единственное, что вызывают точки перехвата.
//
// ─── Это не второй логгер ───────────────────────────────────────────────────
//
// `console.error` рядом с каждой точкой перехвата остаётся: журнал в базе
// может быть недоступен ровно тогда, когда ошибка интереснее всего, и
// контейнерный лог — единственное, что уцелеет. `captureError` сам ничего
// не пишет в stdout, он возвращает `errorId`, который вызывающая сторона
// вписывает в свою строку лога.
//
// ─── Синхронная и ничего не ждёт ────────────────────────────────────────────
//
// Возвращает `errorId` сразу, а запись, решение и доставку делает в
// следующем тике (`setImmediate`, а не микрозадачей: разбор стека и чтение
// карты кода не должны задерживать отдачу ответа 500). Обработчик маршрута
// не ждёт ни Postgres, ни Redis, ни SMTP.
//
// ─── Не бросает исключений. Никогда ─────────────────────────────────────────
//
// Исключение отсюда заменило бы исходную ошибку ошибкой системы наблюдения.
//
// ─── Рекурсия ───────────────────────────────────────────────────────────────
//
// Ничто в `services/observability/**` не вызывает `captureError`: неудачи
// записи, чтения настроек и доставки уходят в `console.warn`.

let processName: ProcessName = "web";

/** Воркеры объявляют себя при старте: `process.argv` роли не говорит. */
export function setProcessName(name: ProcessName): void {
	processName = name;
}

const HOSTNAME = osHostname();

function environment(): string {
	return process.env.NODE_ENV || "development";
}

function adminUrlFor(id: string | number): string {
	const base = (
		process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
	).replace(/\/$/, "");
	return `${base}/admin/collections/error-events/${id}`;
}

const inFlight = new Set<Promise<void>>();

/**
 * Зафиксировать ошибку.
 *
 * @returns `errorId` — впишите его в свою строку лога: по нему находится
 *          полная запись в журнале.
 */
export function captureError(error: unknown, context: CaptureContext): string {
	const errorId = randomUUID();

	try {
		const pending = new Promise<void>((resolve) => {
			setImmediate(() => {
				void handle(errorId, error, context).finally(resolve);
			});
		});

		inFlight.add(pending);
		void pending.finally(() => inFlight.delete(pending));
	} catch {
		// Ничего: см. шапку.
	}

	return errorId;
}

/**
 * Дождаться, пока зафиксированное доедет до базы и очереди. Нужно на пути
 * остановки процесса: `process.exit` не ждёт ни сети, ни базы, и без этого
 * ошибка, которая процесс и остановила, не дошла бы никуда. Ожидание
 * ограничено: остановка не имеет права висеть из-за недоступной базы.
 */
export async function flushCaptures(timeoutMs = 5_000): Promise<void> {
	if (inFlight.size === 0) return;

	await Promise.race([
		Promise.allSettled([...inFlight]),
		new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
	]);
}

async function handle(
	errorId: string,
	error: unknown,
	context: CaptureContext,
): Promise<void> {
	try {
		const normalized = normalizeError(error);
		const severity =
			context.severity ??
			(isClientFault(error) ? "warning" : defaultSeverity(context.source));

		const event: ErrorEvent = {
			errorId,
			fingerprint: computeFingerprint(normalized, context),
			at: new Date(),
			severity,
			environment: environment(),
			processName,
			hostname: HOSTNAME,
			error: normalized,
			context,
		};

		// Сначала запись, потом всё остальное.
		const recordId = await recordErrorEvent(event);

		const settings = await getAlertingSettings();

		if (!settings.emailEnabled || getAlertRecipients().length === 0) {
			if (recordId !== null) {
				await markNotified(
					{ id: recordId },
					false,
					settings.emailEnabled
						? "ERROR_ALERT_EMAIL не задан"
						: "письма выключены в настройках",
				);
			}
			return;
		}

		const decision = await evaluate(
			event.fingerprint,
			severity,
			context.module,
			settings,
		);

		if (!decision.send) {
			if (recordId !== null) {
				await markNotified({ id: recordId }, false, decision.reason);
			}
			return;
		}

		const alert = toSafeAlert(
			event,
			decision.stats,
			recordId === null ? undefined : adminUrlFor(recordId),
		);

		// Отметка «в очереди» — ДО постановки: окончательную ставит обработчик
		// очереди (`alert-worker.ts`) после настоящей доставки, и она не должна
		// оказаться перезаписанной этой, промежуточной.
		if (recordId !== null) {
			await markNotified({ id: recordId }, false, "в очереди на отправку");
		}

		if (await enqueueAlert(alert)) return;

		// Redis недоступен — очереди нет. Отправляем отсюда: медленнее и без
		// ретраев очереди, но альтернатива — молчание в тот момент, когда
		// половина инфраструктуры уже лежит.
		const result = await deliverAlert(alert);

		if (recordId !== null) {
			await markNotified(
				{ id: recordId },
				result.status === "sent",
				result.status === "sent" ? undefined : result.reason,
			);
		}

		if (result.status !== "sent") {
			console.warn("[observability] inline alert delivery failed", {
				errorId,
				status: result.status,
				reason: result.reason,
			});
		}
	} catch (internal) {
		// Последний рубеж: каждый слой ниже уже обязан не бросать.
		console.warn("[observability] capture pipeline failed", {
			errorId,
			error: internal instanceof Error ? internal.message : String(internal),
		});
	}
}
