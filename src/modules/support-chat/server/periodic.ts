import { randomUUID } from "node:crypto";
import { captureError } from "../../../services/observability/capture.ts";
import { drizzleOf } from "./db.ts";
import { getSupportConfig } from "./settings.ts";
import { computeFirstResponseStats, storeStats } from "./stats.ts";
import {
	runMaintenance,
	type SupportDeps,
	sweepAwaiting,
} from "./support.service.ts";

/**
 * Периодические задачи чата — в процессе шлюза, а не отдельным воркером.
 *
 * Все идемпотентные и дешёвые: минутный обход ждущих диалогов
 * (переназначение, эскалация), пересчёт статистики ответа раз в 5 минут и
 * ежечасное обслуживание (автозакрытие, срок хранения, уборка вложений).
 * Отдельный контейнер ради них — лишняя движущаяся часть при одном-двух
 * менеджерах. При нескольких экземплярах шлюза задачу выполняет тот, кто
 * взял блокировку в Redis; упавший экземпляр отпустит её по истечении срока.
 */

const SWEEP_EVERY_MS = 60_000;
const STATS_EVERY_SECONDS = 5 * 60;
const MAINTENANCE_EVERY_SECONDS = 60 * 60;

export function startPeriodicTasks(deps: SupportDeps): () => void {
	const instance = randomUUID();

	const tick = async () => {
		try {
			const sweepLock = await deps.redis.set(
				"support:lock:sweep",
				instance,
				"PX",
				SWEEP_EVERY_MS - 5_000,
				"NX",
			);
			if (sweepLock === "OK") {
				const result = await sweepAwaiting(deps);
				if (result.reassigned || result.escalated || result.queued) {
					console.info("[support-chat] обход ожидания", result);
				}
			}

			const statsLock = await deps.redis.set(
				"support:lock:stats",
				instance,
				"EX",
				STATS_EVERY_SECONDS - 10,
				"NX",
			);
			if (statsLock === "OK") {
				const config = await getSupportConfig(deps.payload);
				await storeStats(
					deps.redis,
					await computeFirstResponseStats(drizzleOf(deps.payload), config),
				);
			}

			const maintenanceLock = await deps.redis.set(
				"support:lock:maintenance",
				instance,
				"EX",
				MAINTENANCE_EVERY_SECONDS - 30,
				"NX",
			);
			if (maintenanceLock === "OK") {
				const result = await runMaintenance(deps);
				if (Object.values(result).some(Boolean)) {
					console.info("[support-chat] обслуживание", result);
				}
			}
		} catch (error) {
			captureError(error, { source: "job", module: "support-chat/periodic" });
		}
	};

	void tick();
	const timer = setInterval(() => void tick(), SWEEP_EVERY_MS);
	timer.unref();
	return () => clearInterval(timer);
}
