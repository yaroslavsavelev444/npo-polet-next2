// scripts/db-migrate/migrations/users.migration.ts

import crypto from "node:crypto";
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyUser {
	_id: ObjectId;
	email: string;
	password: string; // bcrypt hash
	role: "user" | "admin" | "superadmin";
	name: string;
	status?: "active" | "blocked" | "suspended";
	blockedUntil?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
}

// Персонал (role admin/superadmin) сознательно исключён из миграции — в
// новой архитектуре у персонала отдельная коллекция `admins`, и по
// решению из обсуждения миграции эти аккаунты заводятся вручную, а не
// переносятся автоматически.
export default defineMigration({
	slug: "users",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const staffCount = await legacyDb
			.collection<LegacyUser>(LEGACY_COLLECTIONS.users)
			.countDocuments({ role: { $in: ["admin", "superadmin"] } });
		if (staffCount > 0) {
			log.warn(
				`${staffCount} учётных записей персонала (admin/superadmin) в старой БД пропущены по решению — персонал заводится в admins вручную`,
			);
		}

		const cursor = legacyDb
			.collection<LegacyUser>(LEGACY_COLLECTIONS.users)
			.find({ role: "user" });

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			// Пароль мигрированного пользователя нельзя перенести напрямую
			// (bcrypt -> PBKDF2 несовместимы, см. src/modules/auth/lib/
			// legacyPasswordFallback.ts). Ставим случайный неизвестный никому
			// пароль как формальное значение поля Payload auth, а реальный
			// bcrypt-хеш кладём в legacyPasswordHash для fallback при первом входе.
			const placeholderPassword = crypto.randomBytes(32).toString("hex");

			const result = await upsertByLegacyId({
				ctx,
				collection: "users",
				legacyId,
				data: {
					name: old.name,
					email: old.email,
					role: "user",
					status: old.status ?? "active",
					blockedUntil: old.blockedUntil
						? new Date(old.blockedUntil).toISOString()
						: null,
					// Явных данных о верификации email в старой системе нет — считаем
					// существующих активных пользователей верифицированными (это не
					// новая регистрация, а перенос уже работающего аккаунта).
					emailVerified: true,
					twoFAVerified: false,
				},
				// password и legacyPasswordHash пишутся ТОЛЬКО при создании
				// (createOnlyData, см. core/upsert.ts) и никогда не входят в
				// сравнение hasChanges / update:
				// - password обязателен для Payload на create() auth-коллекции,
				//   но при повторных прогонах нельзя каждый раз генерировать
				//   новый случайный пароль и затирать им уже реальный;
				// - legacyPasswordHash по той же причине нельзя постоянно
				//   переустанавливать из старых данных: после первого успешного
				//   входа пользователя (см. legacyPasswordFallback.ts) это поле
				//   намеренно очищается — повторный прогон не должен "воскрешать"
				//   старый bcrypt-хеш для уже мигрировавшего пользователя.
				createOnlyData: {
					password: placeholderPassword,
					...(old.password ? { legacyPasswordHash: old.password } : {}),
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести пользователя ${old.email} (${legacyId})`,
					{
						error:
							result.error instanceof Error
								? result.error.message
								: String(result.error),
					},
				);
				continue;
			}

			stats[result.action]++;
		}

		return stats;
	},
});
