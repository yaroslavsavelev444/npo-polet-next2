import type { Payload } from "payload";
import type { SupportSetting } from "@/payload-types";
import type { RoutingMode, Weekday } from "../lib/constants.ts";

/**
 * Настройки чата (глобал support-settings), приведённые к виду, с которым
 * удобно работать: числа — числами, пилотная группа — множеством, праздники —
 * датами в часовом поясе поддержки.
 *
 * Кэш на процесс — 30 секунд: настройки читаются на каждое подключение и
 * сообщение, а меняются раз в неделю. Изменение в админке вступает в силу
 * в пределах полминуты без перезапуска шлюза.
 */

export interface ScheduleInterval {
	day: Weekday;
	/** Минуты от полуночи. */
	opensAt: number;
	closesAt: number;
	/** Свой срок ответа интервала (выходные — медленнее); null — общий. */
	slaMinutes: number | null;
}

export interface SupportConfig {
	enabled: boolean;
	betaAllowlist: Set<number>;
	timezone: string;
	schedule: ScheduleInterval[];
	/** YYYY-MM-DD в часовом поясе поддержки. */
	holidays: Set<string>;
	texts: { greeting: string; offHoursReply: string };
	routing: {
		mode: RoutingMode;
		firstResponseSlaMinutes: number;
		reassignAfterMinutes: number;
	};
	lifecycle: { reopenWindowDays: number; autoCloseAfterDays: number };
}

const CACHE_TTL_MS = 30_000;

let cached: { config: SupportConfig; expiresAt: number } | null = null;

function toMinutes(value: string | null | undefined): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

/** YYYY-MM-DD момента времени в заданном часовом поясе. */
export function dateKeyInZone(date: Date, timezone: string): string {
	// en-CA форматирует дату ровно как ISO: 2026-10-11.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export function normalizeSupportSettings(
	raw: Partial<SupportSetting> | null,
): SupportConfig {
	const timezone = raw?.timezone || "Europe/Moscow";

	const schedule: ScheduleInterval[] = [];
	for (const interval of raw?.schedule ?? []) {
		const opensAt = toMinutes(interval.opensAt);
		const closesAt = toMinutes(interval.closesAt);
		if (opensAt === null || closesAt === null || closesAt <= opensAt) continue;
		schedule.push({
			day: interval.day as Weekday,
			opensAt,
			closesAt,
			slaMinutes:
				interval.slaMinutes === null || interval.slaMinutes === undefined
					? null
					: Number(interval.slaMinutes),
		});
	}

	const holidays = new Set<string>();
	for (const holiday of raw?.holidays ?? []) {
		if (holiday.date)
			holidays.add(dateKeyInZone(new Date(holiday.date), timezone));
	}

	const betaAllowlist = new Set<number>(
		(raw?.betaAllowlist ?? []).map((user) =>
			typeof user === "object" && user !== null
				? Number(user.id)
				: Number(user),
		),
	);

	return {
		enabled: raw?.enabled === true,
		betaAllowlist,
		timezone,
		schedule,
		holidays,
		texts: {
			greeting: raw?.texts?.greeting ?? "",
			offHoursReply: raw?.texts?.offHoursReply ?? "",
		},
		routing: {
			mode: raw?.routing?.mode === "manual" ? "manual" : "auto",
			firstResponseSlaMinutes: Number(
				raw?.routing?.firstResponseSlaMinutes ?? 15,
			),
			reassignAfterMinutes: Number(raw?.routing?.reassignAfterMinutes ?? 10),
		},
		lifecycle: {
			reopenWindowDays: Number(raw?.lifecycle?.reopenWindowDays ?? 7),
			autoCloseAfterDays: Number(raw?.lifecycle?.autoCloseAfterDays ?? 3),
		},
	};
}

export async function getSupportConfig(
	payload: Payload,
): Promise<SupportConfig> {
	if (cached && cached.expiresAt > Date.now()) return cached.config;

	const raw = (await payload.findGlobal({
		slug: "support-settings",
		depth: 0,
		overrideAccess: true,
	})) as SupportSetting | null;

	const config = normalizeSupportSettings(raw);
	cached = { config, expiresAt: Date.now() + CACHE_TTL_MS };
	return config;
}

/** Сбросить кэш — для тестов и сразу после правки настроек. */
export function invalidateSupportConfig(): void {
	cached = null;
}

/** Пускать ли покупателя в чат: включён для всех или он в пилотной группе. */
export function isChatOpenForUser(
	config: SupportConfig,
	userId: number,
): boolean {
	return config.enabled || config.betaAllowlist.has(userId);
}
