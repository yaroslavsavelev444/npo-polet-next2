import { captureError, flushCaptures, setProcessName } from "./capture.ts";
import { closeAlertQueue } from "./queue.ts";
import { closeObservabilityRedis } from "./redis.ts";

// Ошибки, которые не поймал никто: необработанное исключение и отвергнутый
// промис без обработчика. До этого модуля в воркерах Polet обработчиков не
// было вовсе — процесс падал, Docker его перезапускал, и в логах контейнера
// это выглядело как рестарт без причины.

type HandlersHolder = { __poletProcessCaptureInstalled?: boolean };

/**
 * Веб-приложение.
 *
 * Next сам вешает свои обработчики и НЕ даёт процессу упасть ни на
 * исключении, ни на отвергнутом промисе (server/node-environment-extensions/
 * process-error-handlers.js). Мы только добавляем фиксацию, поведение
 * процесса не меняется.
 *
 * Отвергнутый промис — `warning`: по объяснению самого Next, большая часть
 * таких событий в RSC — штатный «поздний await» (данные запросили заранее,
 * но не понадобились). В журнал они пишутся, письмом по умолчанию не идут.
 */
export function installWebProcessCapture(): void {
	const holder = globalThis as HandlersHolder;
	if (holder.__poletProcessCaptureInstalled) return;
	holder.__poletProcessCaptureInstalled = true;

	setProcessName("web");

	process.on("uncaughtException", (error) => {
		captureError(error, {
			source: "process",
			severity: "error",
			module: "web/uncaught-exception",
		});
	});

	process.on("unhandledRejection", (reason) => {
		captureError(reason, {
			source: "process",
			severity: "warning",
			module: "web/unhandled-rejection",
		});
	});
}

/**
 * Воркер BullMQ.
 *
 * Поведение Node сохраняется — процесс по-прежнему падает (и Docker его
 * поднимает), но перед этим ошибка успевает дойти до журнала и очереди.
 */
export function installWorkerProcessCapture(module: string): void {
	const holder = globalThis as HandlersHolder;
	if (holder.__poletProcessCaptureInstalled) return;
	holder.__poletProcessCaptureInstalled = true;

	setProcessName("worker");

	const crash = (error: unknown, kind: string) => {
		const errorId = captureError(error, {
			source: "process",
			severity: "fatal",
			module: `${module}/${kind}`,
		});
		console.error(`[${module}] ${kind}, exiting`, { errorId, error });
		void flushCaptures()
			.then(closeObservability)
			.finally(() => process.exit(1));
	};

	process.on("uncaughtException", (error) =>
		crash(error, "uncaught-exception"),
	);
	process.on("unhandledRejection", (reason) =>
		crash(reason, "unhandled-rejection"),
	);
}

/** Закрыть соединения модуля — на пути штатной остановки воркера. */
export async function closeObservability(): Promise<void> {
	await Promise.allSettled([closeAlertQueue(), closeObservabilityRedis()]);
}

export { flushCaptures };
