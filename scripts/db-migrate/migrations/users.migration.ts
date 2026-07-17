// scripts/db-migrate/migrations/users.migration.ts

import crypto from "node:crypto";
import type { ObjectId } from "mongodb";
import type { MigrationContext } from "../core/index.ts";
import {
	defineMigration,
	emptyStats,
	extractUniqueConstraintFieldPaths,
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
				`${staffCount} учётных записей персонала (admin/superadmin) в старой БД пропущены по решению — персонал заводится в admins вручную. ` +
					"ВНИМАНИЕ: заказы, оформленные на эти аккаунты, останутся без владельца — см. предупреждения миграции orders.",
			);
		}

		const cursor = legacyDb
			.collection<LegacyUser>(LEGACY_COLLECTIONS.users)
			.find({ role: "user" });

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			// Человек мог зарегистрироваться на новом сайте сам, пока старый ещё
			// работал. Тогда аккаунт с таким email уже есть, но без legacyId —
			// см. adoptExistingByEmail (без этого его исторические заказы
			// остались бы без владельца).
			const adoption = await adoptExistingByEmail(ctx, legacyId, old.email);
			if (adoption === "conflict") {
				stats.skipped++;
				continue;
			}

			// Пароль мигрированного пользователя нельзя перенести напрямую
			// (bcrypt -> PBKDF2 несовместимы, см. src/modules/auth/lib/
			// legacyPasswordFallback.ts). Ставим случайный неизвестный никому
			// пароль как формальное значение поля Payload auth, а реальный
			// bcrypt-хеш кладём в legacyPasswordHash для fallback при первом входе.
			const placeholderPassword = crypto.randomBytes(32).toString("hex");

			const attemptUpsert = () =>
				upsertByLegacyId({
					ctx,
					collection: "users",
					legacyId,
					// Здесь только неизменяемые исторические факты — и это главное
					// свойство этой миграции: во всём остальном старая БД является
					// источником истины ТОЛЬКО в момент создания записи. Дальше
					// аккаунтом владеет новая система, и повторный прогон не имеет
					// права менять в нём состояние.
					//
					// Раньше здесь лежали name/status/blockedUntil/emailVerified/
					// twoFAVerified, и повторный прогон откатывал их к значениям из
					// старой БД: затирал имя, которое человек сменил в профиле, и
					// снимал блокировку, поставленную администратором (проверено:
					// status blocked -> active). Все эти поля переехали в
					// createOnlyData — пишутся один раз при создании и никогда не
					// участвуют ни в сравнении, ни в update (см. core/upsert.ts).
					//
					// Цена решения: правки, сделанные в СТАРОЙ системе после первого
					// прогона (переименование, блокировка), в новую не доедут. Это
					// осознанный размен — старая система выводится из эксплуатации,
					// новая уже авторитетна, а тихий откат админских действий
					// несравнимо опаснее.
					data: {
						// Дата регистрации в старой системе — не «состояние аккаунта»,
						// а факт, который не меняется ни там, ни здесь, поэтому его
						// синхронизация безопасна и нужна: иначе в админке все
						// перенесённые клиенты выглядят зарегистрированными в день
						// миграции. В data (а не в createOnlyData) — чтобы дата
						// починилась и у тех, кого перенесли прошлые прогоны.
						//
						// Для аккаунта, связанного по email (adoptExistingByEmail),
						// это тоже верно: человек стал клиентом тогда, когда
						// зарегистрировался на старом сайте, а не когда завёл учётку
						// на новом.
						//
						// Условный spread обязателен: createdAt: undefined попросил бы
						// Payload затереть дату.
						...(old.createdAt
							? { createdAt: new Date(old.createdAt).toISOString() }
							: {}),
					},
					createOnlyData: {
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
						// password обязателен Payload'у на create() auth-коллекции.
						password: placeholderPassword,
						...(old.password ? { legacyPasswordHash: old.password } : {}),
					},
					// Без этого флага afterChange-хуки Users отрабатывают так, будто
					// статус поменял администратор, и рассылают живым людям письма и
					// in-app уведомления «аккаунт заблокирован» / «аккаунт снова
					// активен» (воспроизведено на повторном прогоне). См.
					// notifyOnStatusChange в src/payload/collections/User.ts.
					context: { isMigration: true },
				});

			let result = await attemptUpsert();

			// Гонка с живым сайтом: пока шла эта миграция, кто-то зарегистрировался
			// на сайте с тем же email. adoptExistingByEmail проверил чуть раньше и
			// ещё не увидел эту запись — она закоммитилась уже ПОСЛЕ проверки, —
			// поэтому create() падает на unique-constraint по email (см. подробный
			// разбор в scripts/db-migrate/README.md). Повторяем обе проверки один
			// раз: на этот раз adoptExistingByEmail увидит уже существующую
			// запись и свяжет legacyId с ней вместо повторной попытки create.
			//
			// Повторный adoptExistingByEmail здесь МОЖЕТ вернуть "conflict" —
			// например если конкурентная запись успела получить чужой legacyId
			// (крайне маловероятно, но не невозможно) — тогда это уже не гонка,
			// а настоящий конфликт данных, и мы обрабатываем его так же, как в
			// первой попытке: пропускаем запись, не повторяя upsert ещё раз.
			if (
				result.action === "failed" &&
				extractUniqueConstraintFieldPaths(result.error).includes("email")
			) {
				const retryAdoption = await adoptExistingByEmail(
					ctx,
					legacyId,
					old.email,
				);
				if (retryAdoption === "conflict") {
					stats.skipped++;
					continue;
				}
				result = await attemptUpsert();
			}

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

			// upsertByLegacyId никогда не применяет createOnlyData к уже
			// существующей записи (см. core/upsert.ts) — это осознанно (иначе
			// повторный прогон мог бы затирать реальный пароль, который
			// пользователь уже установил через фоллбек). Но это же правило
			// означает, что если legacyPasswordHash не долетел при первом
			// прогоне (например, поле добавили в схему уже после него), он
			// НИКОГДА не будет донесён последующими прогонами. Здесь —
			// единственное безопасное место для бэкафилла: только для
			// записей, которые (по нашему собственному, а не унаследованному
			// от старой БД признаку legacyPasswordMigrated) точно ещё не
			// проходили фоллбек.
			if (
				!ctx.dryRun &&
				(result.action === "updated" || result.action === "unchanged") &&
				old.password &&
				result.id !== undefined
			) {
				await backfillLegacyPasswordHash(ctx, result.id, old.password);
			}
		}

		return stats;
	},
});

type AdoptionResult =
	/** Существующий аккаунт связан с legacyId (или был бы связан в dry-run). */
	| "adopted"
	/** Email занят другим legacy-аккаунтом — нужно ручное решение. */
	| "conflict"
	/** Подходящего аккаунта нет либо он уже связан — обычный путь upsert. */
	| "none";

/**
 * Связывает уже существующий в новой БД аккаунт с его legacy-двойником по email.
 *
 * Зачем. Пока старый сайт ещё принимает регистрации, человек может завести
 * аккаунт и на новом сайте. Тогда в новой БД есть запись с тем же email, но
 * без legacyId: миграция ищет по legacyId, не находит и делает create, а он
 * падает на unique email. Раньше это уходило в failed, и следствие было
 * тяжелее самой ошибки — раз записи с таким legacyId нет, resolveRef в
 * orders.migration возвращал undefined, и ВСЕ исторические заказы этого
 * человека переносились без владельца: оплаченные заказы, которых больше
 * никто не видит в «Мои заказы» (воспроизведено).
 *
 * email — идентификатор человека в обеих системах (unique и там, и там),
 * поэтому совпадение email означает «это тот же человек», и правильное
 * действие — связать записи, а не плодить и не ронять.
 *
 * Пароль при этом НЕ трогаем: у человека уже есть рабочий пароль в формате
 * Payload, который он задал сам. Более того, помечаем аккаунт
 * legacyPasswordMigrated — иначе backfillLegacyPasswordHash подложил бы ему
 * bcrypt-хеш старого пароля, и старый (возможно, утёкший или намеренно
 * заменённый) пароль снова начал бы подходить через legacyPasswordFallback.
 */
async function adoptExistingByEmail(
	ctx: MigrationContext,
	legacyId: string,
	email: string,
): Promise<AdoptionResult> {
	const { docs } = await ctx.payload.find({
		collection: "users",
		where: { email: { equals: email } },
		limit: 1,
		overrideAccess: true,
		depth: 0,
	});

	const existing = docs[0];
	if (!existing) return "none";
	if (existing.legacyId === legacyId) return "none"; // уже связан — обычный путь

	if (existing.legacyId) {
		ctx.log.error(
			`Email ${email} занят аккаунтом с другим legacyId (${existing.legacyId}), а переносится ${legacyId} — пропуск, нужно ручное решение`,
		);
		return "conflict";
	}

	if (ctx.dryRun) {
		ctx.log.warn(
			`[dry-run] Аккаунт ${email} заведён на новом сайте самостоятельно — был бы связан с legacyId=${legacyId}`,
		);
		return "adopted";
	}

	await ctx.payload.update({
		collection: "users",
		id: existing.id,
		data: { legacyId, legacyPasswordMigrated: true },
		overrideAccess: true,
		depth: 0,
		context: { isMigration: true },
	});
	ctx.log.warn(
		`Аккаунт ${email} заведён на новом сайте самостоятельно — связан с legacyId=${legacyId}, его исторические заказы получат владельца. Пароль и профиль не тронуты.`,
	);
	return "adopted";
}

/**
 * Донасаживает legacyPasswordHash для уже существующей (по legacyId) записи,
 * если он ещё не был перенесён и пользователь точно ещё не проходил
 * bcrypt-фоллбек (см. legacyPasswordFallback.ts, где legacyPasswordMigrated
 * выставляется в true одновременно с очисткой хеша). Если оба условия не
 * выполняются — запись не трогаем вообще, чтобы не воскрешать умышленно
 * очищенный хеш и не перезаписывать уже сменённый пользователем пароль.
 */
async function backfillLegacyPasswordHash(
	ctx: MigrationContext,
	userId: string | number,
	legacyBcryptHash: string,
): Promise<void> {
	const existing = await ctx.payload.findByID({
		collection: "users",
		id: userId,
		overrideAccess: true,
		depth: 0,
		select: { legacyPasswordHash: true, legacyPasswordMigrated: true },
	});

	if (existing.legacyPasswordMigrated || existing.legacyPasswordHash) {
		return;
	}

	await ctx.payload.update({
		collection: "users",
		id: userId,
		data: { legacyPasswordHash: legacyBcryptHash },
		overrideAccess: true,
		depth: 0,
		context: { isMigration: true },
	});
	ctx.log.warn(
		`legacyPasswordHash донесён повторным прогоном для пользователя id=${userId} (не был перенесён при создании)`,
	);
}
