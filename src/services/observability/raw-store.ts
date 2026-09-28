import { formatFrame } from "./normalize.ts";
import { getPayloadForObservability } from "./payload.ts";
import type { ErrorEvent } from "./types.ts";

// Запись полного происшествия в журнал `error-events`.
//
// Происходит ПЕРЕД решением об отправке и доставкой: пока запись сделана,
// недоступность почты означает «узнаю позже», а не «не узнаю никогда».
//
// Функции не бросают исключений: они стоят на пути обработки уже случившейся
// ошибки, и исключение отсюда подменило бы исходную проблему проблемой
// системы наблюдения. Неудачи — в `console.warn`, а не в `captureError`:
// иначе неудачная запись об ошибке породила бы запись об ошибке записи.

/** Стек длиннее этого информации не добавляет, а строку раздувает. */
const MAX_STACK_CHARS = 16_000;

const MAX_TEXT_CHARS = 8_000;

/**
 * Потолок на доменный контекст: его наполняет вызывающая сторона, и туда
 * однажды попадёт целиком тело запроса.
 */
function boundExtra(
	extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!extra) return undefined;

	try {
		const serialized = JSON.stringify(extra);
		if (serialized === undefined) return undefined;

		if (serialized.length <= MAX_TEXT_CHARS) {
			return JSON.parse(serialized) as Record<string, unknown>;
		}

		return {
			truncated: true,
			size: serialized.length,
			preview: serialized.slice(0, MAX_TEXT_CHARS),
		};
	} catch {
		return { unserializable: true };
	}
}

function joinCauses(causes: { name: string; message: string }[]) {
	return causes.length > 0
		? causes.map((cause) => `${cause.name}: ${cause.message}`).join("\n")
		: undefined;
}

/**
 * Сохранить происшествие. Возвращает id записи — по нему в письме строится
 * ссылка на карточку, — или `null`, если записать не удалось: письмо со
 * ссылкой на несуществующую запись хуже письма без ссылки.
 */
export async function recordErrorEvent(
	event: ErrorEvent,
): Promise<string | number | null> {
	try {
		const payload = await getPayloadForObservability();
		const { error, context } = event;

		const doc = await payload.create({
			collection: "error-events",
			overrideAccess: true,
			depth: 0,
			data: {
				errorId: event.errorId,
				fingerprint: event.fingerprint,
				occurredAt: event.at.toISOString(),
				severity: event.severity,
				environment: event.environment,
				processName: event.processName,
				hostname: event.hostname,
				source: context.source,
				module: context.module,
				errorName: error.name.slice(0, 200),
				message: error.message,
				code: error.code,
				frames: error.frames.map(formatFrame).join("\n") || undefined,
				causes: joinCauses(error.causes),
				httpMethod: context.http?.method,
				httpRoute: context.http?.route,
				httpStatus: context.http?.status,
				jobQueue: context.job?.queue,
				jobName: context.job?.name,
				jobAttempt:
					context.job?.attempt === undefined
						? undefined
						: context.job.maxAttempts === undefined
							? String(context.job.attempt)
							: `${context.job.attempt} / ${context.job.maxAttempts}`,
				raw: {
					message: error.rawMessage.slice(0, MAX_TEXT_CHARS),
					causes: joinCauses(error.rawCauses)?.slice(0, MAX_TEXT_CHARS),
					stack: error.rawStack?.slice(0, MAX_STACK_CHARS),
					path: context.http?.path?.slice(0, 2_000),
					userId:
						context.userId === null || context.userId === undefined
							? undefined
							: String(context.userId),
					ip: context.ip ?? undefined,
					userAgent: context.userAgent?.slice(0, 500) ?? undefined,
					extra: boundExtra(context.extra),
				},
			},
		});

		return doc.id;
	} catch (storeError) {
		console.warn("[observability] error event could not be persisted", {
			errorId: event.errorId,
			error:
				storeError instanceof Error ? storeError.message : String(storeError),
		});
		return null;
	}
}

/**
 * Отметить, чем кончилось решение об отправке. Отвечает на вопрос «почему я
 * об этом не узнал»: пауза, порог уровня, часовой лимит или отказ почты.
 *
 * Запись находится по id (из того же процесса, что её создал) или по
 * `errorId` (из обработчика очереди, который видит только `SafeAlert`).
 */
export async function markNotified(
	target: { id: string | number } | { errorId: string },
	sent: boolean,
	reason?: string,
): Promise<void> {
	try {
		const payload = await getPayloadForObservability();
		const data = { notifiedSent: sent, notifiedReason: reason ?? null };

		if ("id" in target) {
			await payload.update({
				collection: "error-events",
				id: target.id,
				overrideAccess: true,
				depth: 0,
				data,
			});
		} else {
			await payload.update({
				collection: "error-events",
				where: { errorId: { equals: target.errorId } },
				overrideAccess: true,
				depth: 0,
				data,
			});
		}
	} catch (updateError) {
		console.warn("[observability] delivery status could not be recorded", {
			target,
			error:
				updateError instanceof Error
					? updateError.message
					: String(updateError),
		});
	}
}
