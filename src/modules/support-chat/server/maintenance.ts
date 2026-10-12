import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { sql } from "@payloadcms/db-postgres";
import { type Executor, num, query, type SQL } from "./db.ts";
import { attachmentsDir } from "./storage-path.ts";

/**
 * Обслуживание переписки: сроки хранения, обезличивание, уборка файлов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОБЕЗЛИЧИВАНИЕ = УНИЧТОЖЕНИЕ КЛЮЧА
 * ────────────────────────────────────────────────────────────────────────────
 * Переписка зашифрована ключом диалога (crypto.ts). Обезличенный диалог
 * теряет ключ (encryption_key = ''), сообщения и вложения удаляются, связь с
 * покупателем, комментарий к оценке, метки, согласие и устройство — тоже.
 * Остаются только служебные цифры для отчётов: тема, менеджер, время
 * первого ответа и закрытия, оценка без комментария.
 *
 * Зачем уничтожать ключ, если сообщения и так удаляются: бэкапы. В бэкапе
 * базы, снятом до обезличивания, шифртекст и обёрнутый ключ ещё есть — но
 * вместе с бэкапом мастер-ключа они не лежат (раздел 14), а в бэкапах после
 * обезличивания нет уже ничего.
 *
 * Файлы на диске здесь не трогаются: эту функцию зовёт и транзакция удаления
 * аккаунта в воркере, у которого нет тома с файлами. Файлы без записи в базе
 * — без ключа нечитаемый мусор — убирает `purgeOrphanFiles` в шлюзе.
 */

/** Срок хранения переписки — решение владельца, 11.10.2026. */
export const RETENTION_YEARS = 3;
/** Неотправленное вложение живёт сутки. */
const PENDING_ATTACHMENT_TTL = sql`interval '24 hours'`;
/** Файл без записи в базе удаляется не раньше, чем через час (идущая загрузка). */
const ORPHAN_GRACE_MS = 60 * 60_000;

/**
 * Обезличить диалоги, выбранные условием над `c` (support_conversations).
 * Идемпотентна: уже обезличенные (encryption_key = '') не трогаются.
 */
async function anonymize(db: Executor, where: SQL): Promise<number> {
	const ids = (
		await query(
			db,
			sql`SELECT c.id FROM support_conversations c
				WHERE c.encryption_key <> '' AND (${where})`,
		)
	).map((row) => num(row.id));
	if (ids.length === 0) return 0;
	const list = sql`${`{${ids.join(",")}}`}::int[]`;

	await db.execute(
		sql`DELETE FROM support_attachments WHERE conversation_id = ANY(${list})`,
	);
	await db.execute(
		sql`DELETE FROM support_messages WHERE conversation_id = ANY(${list})`,
	);
	await db.execute(
		sql`DELETE FROM support_conversations_texts WHERE parent_id = ANY(${list})`,
	);
	await db.execute(sql`
		UPDATE support_conversations
		SET user_id = NULL,
			encryption_key = '',
			status = 'resolved',
			resolved_at = COALESCE(resolved_at, now()),
			awaiting_reply_since = NULL,
			snoozed_until = NULL,
			csat_comment = NULL,
			consent_accepted_at = NULL,
			consent_document = NULL,
			user_agent = NULL,
			updated_at = now()
		WHERE id = ANY(${list})
	`);
	return ids.length;
}

/**
 * Удаление аккаунта: вся переписка покупателя обезличивается. Зовётся внутри
 * транзакции удаления (modules/account-deletion) до удаления строки users.
 * Неотправленные вложения покупателя удаляются тоже.
 */
export async function anonymizeUserConversations(
	db: Executor,
	userId: number,
): Promise<number> {
	await db.execute(sql`
		DELETE FROM support_attachments
		WHERE uploaded_by_user_id = ${userId} AND message_id IS NULL
	`);
	return anonymize(db, sql`c.user_id = ${userId}`);
}

/** Срок хранения истёк: последнее сообщение старше RETENTION_YEARS лет. */
export async function anonymizeExpired(db: Executor): Promise<number> {
	return anonymize(
		db,
		sql`COALESCE(c.last_message_at, c.created_at) < now() - make_interval(years => ${RETENTION_YEARS})`,
	);
}

/** Неотправленные вложения старше суток — запись; файл уберёт purgeOrphanFiles. */
export async function deleteStalePendingAttachments(
	db: Executor,
): Promise<number> {
	const rows = await query(
		db,
		sql`DELETE FROM support_attachments
			WHERE message_id IS NULL AND created_at < now() - ${PENDING_ATTACHMENT_TTL}
			RETURNING id`,
	);
	return rows.length;
}

/**
 * Открытые диалоги, где последнее слово за менеджером и покупатель молчит
 * дольше `days` дней — кандидаты на закрытие.
 */
export async function listStaleConversations(
	db: Executor,
	days: number,
): Promise<number[]> {
	const rows = await query(
		db,
		sql`SELECT id FROM support_conversations
			WHERE status = 'open'
				AND encryption_key <> ''
				AND awaiting_reply_since IS NULL
				AND (snoozed_until IS NULL OR snoozed_until <= now())
				AND last_staff_message_at IS NOT NULL
				AND last_staff_message_at < now() - make_interval(days => ${days})
			LIMIT 200`,
	);
	return rows.map((row) => num(row.id));
}

/**
 * Файлы вложений без записи в базе: удалённые вместе с диалогом,
 * неотправленные, обезличенные. Без ключа (он был только в записи) они —
 * нечитаемый мусор, но место и сам факт наличия — повод убрать.
 */
export async function purgeOrphanFiles(db: Executor): Promise<number> {
	const dir = attachmentsDir();
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return 0; // каталога нет — в этом процессе файлов нет (нет тома)
	}

	const keyOf = (name: string) =>
		name.replace(/\.thumb$/, "").replace(/\.\d+\.tmp$/, "");
	const keys = [
		...new Set(names.map(keyOf).filter((key) => /^[0-9a-f-]{36}$/.test(key))),
	];
	if (keys.length === 0) return 0;

	const known = new Set<string>();
	for (let i = 0; i < keys.length; i += 500) {
		const batch = keys.slice(i, i + 500);
		const rows = await query(
			db,
			sql`SELECT storage_key FROM support_attachments
				WHERE storage_key = ANY(${`{${batch.join(",")}}`}::text[])`,
		);
		for (const row of rows) known.add(String(row.storage_key));
	}

	let removed = 0;
	const now = Date.now();
	for (const name of names) {
		const key = keyOf(name);
		if (!/^[0-9a-f-]{36}$/.test(key) || known.has(key)) continue;
		const file = path.join(dir, name);
		try {
			if (now - (await stat(file)).mtimeMs < ORPHAN_GRACE_MS) continue;
			await unlink(file);
			removed++;
		} catch {
			// Файл уже удалён параллельно — ничего страшного.
		}
	}
	return removed;
}
