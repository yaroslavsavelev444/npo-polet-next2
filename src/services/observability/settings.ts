import { getPayloadForObservability } from "./payload.ts";
import type { AlertingSettings } from "./types.ts";
import { DEFAULT_ALERTING_SETTINGS, isSeverity } from "./types.ts";

// Настройки оповещений из глобала `alerting-settings`, с кэшем.
//
// Отказ чтения означает умолчания, а не остановку: система оповещения,
// переставшая оповещать оттого, что не смогла прочитать свои настройки, —
// ровно та поломка, о которой она должна была сообщить.
//
// Кэш — минута: порог правят в разгар инцидента, и ждать дольше никто не
// станет. Неудача кэшируется на 15 секунд, чтобы шторм ошибок не стал
// штормом обращений к недоступной базе.

const CACHE_TTL_MS = 60_000;
const FAILURE_TTL_MS = 15_000;

let cache: { value: AlertingSettings; expiresAt: number } | null = null;

function toList(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

/**
 * Число с границами. Границы полей Payload проверяют ввод в админке, но не
 * значение, правленное в базе напрямую: ноль писем в час выключил бы
 * оповещения целиком и выглядел бы как поломка.
 */
function toNumber(value: unknown, fallback: number, min: number, max: number) {
	const parsed = Number(value);
	if (value === null || value === undefined || !Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function parseAlertingSettings(
	global: Record<string, unknown> | null | undefined,
): AlertingSettings {
	const g = global ?? {};
	const d = DEFAULT_ALERTING_SETTINGS;

	const value: AlertingSettings = {
		// `!== false`, а не `=== true`: у ни разу не сохранённого глобала поля
		// нет вовсе, и `undefined` обязан значить «как по умолчанию».
		emailEnabled: g.emailEnabled !== false,
		severityThreshold: isSeverity(g.severityThreshold)
			? g.severityThreshold
			: d.severityThreshold,
		cooldownBaseSeconds: toNumber(
			g.cooldownBaseSeconds,
			d.cooldownBaseSeconds,
			10,
			3_600,
		),
		cooldownMaxSeconds: toNumber(
			g.cooldownMaxSeconds,
			d.cooldownMaxSeconds,
			60,
			86_400,
		),
		cooldownResetSeconds: toNumber(
			g.cooldownResetSeconds,
			d.cooldownResetSeconds,
			300,
			604_800,
		),
		maxMessagesPerHour: toNumber(
			g.maxMessagesPerHour,
			d.maxMessagesPerHour,
			1,
			500,
		),
		burstEscalation: g.burstEscalation !== false,
		warnings: {
			enabled: g.warningsEnabled === true,
			allowedModules: toList(g.warningsModules),
		},
		dailyDigest: g.dailyDigest !== false,
	};

	// Потолок ниже базы — удвоение не работает. Чиним молча.
	if (value.cooldownMaxSeconds < value.cooldownBaseSeconds) {
		value.cooldownMaxSeconds = value.cooldownBaseSeconds;
	}

	return value;
}

/** Не бросает ни при каком состоянии Payload и базы. */
export async function getAlertingSettings(
	now = Date.now(),
): Promise<AlertingSettings> {
	if (cache && cache.expiresAt > now) return cache.value;

	try {
		const payload = await getPayloadForObservability();
		const global = (await payload.findGlobal({
			slug: "alerting-settings",
			depth: 0,
			overrideAccess: true,
		})) as unknown as Record<string, unknown> | null;

		const value = parseAlertingSettings(global);
		cache = { value, expiresAt: now + CACHE_TTL_MS };
		return value;
	} catch (error) {
		console.warn("[observability] alerting settings could not be read", {
			error: error instanceof Error ? error.message : String(error),
		});
		cache = {
			value: DEFAULT_ALERTING_SETTINGS,
			expiresAt: now + FAILURE_TTL_MS,
		};
		return DEFAULT_ALERTING_SETTINGS;
	}
}
