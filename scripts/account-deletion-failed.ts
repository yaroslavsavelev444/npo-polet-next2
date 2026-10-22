/**
 * Заявки на удаление аккаунта, застрявшие в `failed`.
 *
 *   pnpm account-deletion:failed               # только список
 *   pnpm account-deletion:failed --reschedule  # вернуть в очередь
 *
 * Откуда они: до 21.10.2026 очередь отвергала каждую задачу (jobId с
 * двоеточием) — заявка сразу уходила в failed / QUEUE_SCHEDULING_FAILED; а
 * с 17.07 само исполнение падало на `feedbacks.user_id` (колонку убрала
 * миграция feedback_simplify) и после 8 попыток тоже становилось failed.
 * Покупатель при этом просил удалить данные — право по ст. 21 152-ФЗ, и
 * заявку нужно исполнить.
 *
 * Список — без персональных данных: id заявки, id аккаунта, даты, код
 * ошибки. Почту при необходимости смотреть в админке по id аккаунта.
 *
 * --reschedule: заявка снова pending, срок — прежний (если 14 дней уже
 * прошли — исполнится сразу, как только задачу возьмёт воркер
 * account-deletion), задача ставится в очередь. Пропускаются заявки, у
 * аккаунта которых уже есть другая активная (покупатель подал новую) или
 * аккаунта уже нет. Нужны Redis и запущенный воркер.
 */
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import {
	closeAccountDeletionQueue,
	scheduleAccountDeletion,
} from "../src/modules/account-deletion/lib/queue.ts";

const reschedule = process.argv.includes("--reschedule");

const payload = await getPayload({ config });
const db = payload.db.drizzle;

type Row = {
	id: number;
	user_id: number | null;
	requested_at: string;
	scheduled_for: string;
	last_error_code: string | null;
	execution_attempts: string | number | null;
	user_exists: boolean;
	has_active: boolean;
};

const { rows } = (await db.execute(sql`
	SELECT r.id, r.user_id, r.requested_at, r.scheduled_for, r.last_error_code,
		r.execution_attempts,
		EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id) AS user_exists,
		EXISTS (
			SELECT 1 FROM account_deletion_requests o
			WHERE o.user_id = r.user_id AND o.status IN ('pending', 'executing')
		) AS has_active
	FROM account_deletion_requests r
	WHERE r.status = 'failed'
	ORDER BY r.requested_at
`)) as { rows: Row[] };

const date = (value: string) => new Date(value).toISOString().slice(0, 16);

if (rows.length === 0) {
	console.log("Заявок в статусе failed нет.");
	process.exit(0);
}

console.log(`Заявок в статусе failed: ${rows.length}\n`);
console.log(
	"заявка | аккаунт | подана           | срок             | ошибка | попыток | что будет",
);
for (const row of rows) {
	const verdict =
		!row.user_id || !row.user_exists
			? "пропуск: аккаунта нет"
			: row.has_active
				? "пропуск: есть новая активная заявка"
				: "вернуть в очередь";
	console.log(
		[
			row.id,
			row.user_id ?? "—",
			date(row.requested_at),
			date(row.scheduled_for),
			row.last_error_code ?? "—",
			Number(row.execution_attempts ?? 0),
			verdict,
		].join(" | "),
	);
}

if (!reschedule) {
	console.log("\nТолько список. Вернуть в очередь: --reschedule");
	process.exit(0);
}

let done = 0;
for (const row of rows) {
	if (!row.user_id || !row.user_exists || row.has_active) continue;
	// Условный UPDATE: если заявку уже поменяли (вторая копия скрипта,
	// админка) — ничего не делаем.
	const updated = (await db.execute(sql`
		UPDATE account_deletion_requests
		SET status = 'pending', last_error_code = NULL,
			execution_lease_until = NULL, updated_at = NOW()
		WHERE id = ${row.id} AND status = 'failed'
		RETURNING scheduled_for
	`)) as { rows: { scheduled_for: string }[] };
	const scheduled = updated.rows[0];
	if (!scheduled) continue;
	const delay = Math.max(
		0,
		new Date(scheduled.scheduled_for).getTime() - Date.now(),
	);
	try {
		await scheduleAccountDeletion(row.id, delay);
		done++;
	} catch (err) {
		// Очередь недоступна — возвращаем как было, чтобы заявка не висела
		// pending без задачи.
		await db.execute(sql`
			UPDATE account_deletion_requests
			SET status = 'failed', last_error_code = 'QUEUE_SCHEDULING_FAILED', updated_at = NOW()
			WHERE id = ${row.id} AND status = 'pending'
		`);
		console.error(
			`Заявка ${row.id}: не удалось поставить в очередь`,
			(err as Error).name,
		);
	}
}
console.log(
	`\nВозвращено в очередь: ${done}. Исполнит воркер account-deletion.`,
);
await closeAccountDeletionQueue();
process.exit(0);
