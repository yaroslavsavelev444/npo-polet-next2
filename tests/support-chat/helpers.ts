/**
 * Общая обвязка интеграционных тестов чата: настоящие Postgres и Redis,
 * тестовые покупатели и менеджеры, документ согласия, уборка за собой.
 *
 * Всё, что создаётся, помечается RUN — повторный запуск не встречает
 * остатков прошлого, а уборка удаляет только своё.
 */

import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import Redis from "ioredis";
import { getPayload, type Payload } from "payload";
import config from "../../payload.config.ts";
import { redisConfig } from "../../src/modules/auth/lib/redis-config.ts";
import { deleteAttachmentFiles } from "../../src/modules/support-chat/server/attachments.ts";
import type { Broadcaster } from "../../src/modules/support-chat/server/broadcast.ts";
import type {
	CustomerActor,
	StaffActor,
} from "../../src/modules/support-chat/server/permissions.ts";
import { clearPresence } from "../../src/modules/support-chat/server/presence.ts";
import { invalidateSupportConfig } from "../../src/modules/support-chat/server/settings.ts";
import type { SupportDeps } from "../../src/modules/support-chat/server/support.service.ts";
import { AUTH_FLOW_CONTEXT } from "../../src/payload/hooks/users/requireServerAuthFlow.ts";

export const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORD = "Support-Chat-Test-1";
export const CONSENT_SLUG = `support-chat-test-${RUN}`;

/** Событие, «отправленное» сервисом: куда, что и с чем. */
export interface Emitted {
	room: string;
	event: string;
	data: unknown;
}

/** Broadcaster, который запоминает события вместо отправки. */
export function recordingBroadcaster(): Broadcaster & { events: Emitted[] } {
	const events: Emitted[] = [];
	return {
		events,
		to(room) {
			return {
				emit(event: string, data: unknown) {
					for (const r of Array.isArray(room) ? room : [room]) {
						events.push({ room: r, event, data });
					}
				},
			};
		},
		in() {
			return { disconnectSockets() {} };
		},
	};
}

export interface Fixture {
	payload: Payload;
	redis: Redis;
	userIds: number[];
	adminIds: number[];
	settingsBackup: {
		enabled: boolean;
		routingMode: string;
		schedule: ScheduleRow[];
	} | null;
}

export async function setupFixture(): Promise<Fixture> {
	const payload = await getPayload({ config });
	const redis = new Redis(redisConfig);

	await payload.db.drizzle.execute(sql`
		INSERT INTO consents (title, slug, content, needs_acceptance, is_active, version)
		VALUES ('Тест чата', ${CONSENT_SLUG}, 'Текст', TRUE, TRUE, '2.1.0')
	`);

	const current = await payload.findGlobal({
		slug: "support-settings",
		overrideAccess: true,
	});
	const fixture: Fixture = {
		payload,
		redis,
		userIds: [],
		adminIds: [],
		settingsBackup: {
			enabled: current.enabled === true,
			routingMode: current.routing?.mode ?? "auto",
			schedule: (current.schedule ?? []).map(
				({ day, opensAt, closesAt, slaMinutes }) => ({
					day,
					opensAt,
					closesAt,
					slaMinutes: slaMinutes ?? null,
				}),
			),
		},
	};
	await setSettings(fixture, { enabled: true, routingMode: "auto" });
	return fixture;
}

export interface ScheduleRow {
	day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
	opensAt: string;
	closesAt: string;
	slaMinutes?: number | null;
}

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** Расписание «открыто всегда» — тесты не должны зависеть от часов запуска. */
export const ALWAYS_OPEN: ScheduleRow[] = ALL_DAYS.map((day) => ({
	day,
	opensAt: "00:00",
	closesAt: "23:59",
}));

/** Расписание «закрыто всегда»: ни одного интервала. */
export const ALWAYS_CLOSED: ScheduleRow[] = [];

export async function setSettings(
	fixture: Fixture,
	values: {
		enabled?: boolean;
		routingMode?: "auto" | "manual";
		schedule?: ScheduleRow[];
	},
): Promise<void> {
	await fixture.payload.updateGlobal({
		slug: "support-settings",
		data: {
			...(values.enabled !== undefined ? { enabled: values.enabled } : {}),
			...(values.routingMode ? { routing: { mode: values.routingMode } } : {}),
			...(values.schedule ? { schedule: values.schedule } : {}),
		},
		overrideAccess: true,
	});
	invalidateSupportConfig();
}

export async function makeCustomer(
	fixture: Fixture,
	key: string,
	status: "active" | "blocked" = "active",
): Promise<CustomerActor & { email: string }> {
	const email = `support-chat-${RUN}-${key}@example.test`;
	const user = await fixture.payload.create({
		collection: "users",
		data: {
			email,
			password: PASSWORD,
			name: `Покупатель ${key}`,
			role: "user",
			status,
		},
		overrideAccess: true,
	});
	fixture.userIds.push(Number(user.id));
	return {
		kind: "customer",
		userId: Number(user.id),
		name: user.name,
		email,
		chatBanned: false,
	};
}

let agentCounter = 0;

export async function makeAgent(
	fixture: Fixture,
	key: string,
): Promise<StaffActor & { email: string }> {
	// key — имя для покупателей, часто кириллицей; в адрес идёт счётчик.
	const email = `support-chat-${RUN}-agent${++agentCounter}@example.test`;
	const admin = await fixture.payload.create({
		collection: "admins",
		data: {
			email,
			password: PASSWORD,
			name: `Менеджер ${key}`,
			role: "admin",
			support: { displayName: key },
		},
		overrideAccess: true,
	});
	fixture.adminIds.push(Number(admin.id));
	return {
		kind: "staff",
		adminId: Number(admin.id),
		name: key,
		role: "admin",
		email,
	};
}

/** Cookie сессии, как её выдаёт настоящий вход. */
export async function sessionCookie(
	fixture: Fixture,
	collection: "users" | "admins",
	email: string,
): Promise<string> {
	const result = await fixture.payload.login({
		collection,
		data: { email, password: PASSWORD },
		context: AUTH_FLOW_CONTEXT,
		overrideAccess: true,
	});
	if (!result.token) throw new Error("Вход не выдал токен");
	return `payload-token=${result.token}`;
}

export function deps(fixture: Fixture, broadcaster: Broadcaster): SupportDeps {
	return { payload: fixture.payload, redis: fixture.redis, broadcaster };
}

export async function teardownFixture(fixture: Fixture): Promise<void> {
	const { payload } = fixture;
	const swallow = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
		} catch {
			// Уборка не должна прятать настоящую причину падения теста.
		}
	};

	if (fixture.userIds.length > 0) {
		const ids = `{${fixture.userIds.join(",")}}`;
		const adminIds = `{${fixture.adminIds.join(",")}}`;
		// Вложения тестовых покупателей и менеджеров — вместе с зашифрованными
		// файлами на диске.
		await swallow(async () => {
			const removed = (await payload.db.drizzle.execute(sql`
				DELETE FROM support_attachments
				WHERE uploaded_by_user_id = ANY(${ids}::int[])
					OR visible_to_user_id = ANY(${ids}::int[])
					OR uploaded_by_admin_id = ANY(${adminIds}::int[])
				RETURNING storage_key
			`)) as unknown as { rows: { storage_key: string }[] };
			for (const row of removed.rows)
				await deleteAttachmentFiles(row.storage_key);
		});
		await swallow(() =>
			payload.db.drizzle.execute(
				sql`DELETE FROM support_conversations WHERE user_id = ANY(${ids}::int[])`,
			),
		);
		// Блокировка в тесте рождает уведомление, а его user_id NOT NULL —
		// без этой строки удаление покупателя падает на внешнем ключе.
		await swallow(() =>
			payload.db.drizzle.execute(
				sql`DELETE FROM notifications WHERE user_id = ANY(${ids}::int[])`,
			),
		);
		await swallow(() =>
			payload.db.drizzle.execute(
				sql`DELETE FROM users WHERE id = ANY(${ids}::int[])`,
			),
		);
	}
	if (fixture.adminIds.length > 0) {
		const ids = `{${fixture.adminIds.join(",")}}`;
		for (const adminId of fixture.adminIds) {
			await swallow(() => clearPresence(fixture.redis, adminId));
		}
		await swallow(() =>
			payload.db.drizzle.execute(
				sql`DELETE FROM support_canned_responses WHERE owner_id = ANY(${ids}::int[])`,
			),
		);
		await swallow(() =>
			payload.db.drizzle.execute(
				sql`DELETE FROM admins WHERE id = ANY(${ids}::int[])`,
			),
		);
	}
	await swallow(() =>
		payload.db.drizzle.execute(
			sql`DELETE FROM consents WHERE slug = ${CONSENT_SLUG}`,
		),
	);

	if (fixture.settingsBackup) {
		await swallow(() =>
			setSettings(fixture, {
				enabled: fixture.settingsBackup?.enabled,
				routingMode: fixture.settingsBackup?.routingMode as "auto" | "manual",
				schedule: fixture.settingsBackup?.schedule,
			}),
		);
	}
	await fixture.redis.quit().catch(() => fixture.redis.disconnect());
}
