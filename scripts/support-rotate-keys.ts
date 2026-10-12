/**
 * Переобернуть ключи данных чата поддержки действующим мастер-ключом.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types \
 *     --import ./tests/support/next-subpath-resolver.mjs scripts/support-rotate-keys.ts
 *
 * Порядок смены мастер-ключа (src/modules/support-chat/server/crypto.ts):
 *  1. Сгенерировать новый: `openssl rand -base64 32`.
 *  2. Поставить его ПЕРВЫМ в SUPPORT_ENCRYPTION_KEYS, старый оставить вторым:
 *     `v2:<новый>,v1:<старый>` — и перезапустить приложение и шлюз. С этого
 *     момента новые диалоги и файлы получают ключи под v2, старые читаются
 *     через v1.
 *  3. Запустить этот скрипт: ключи данных под v1 переобёртываются в v2.
 *     Сами сообщения и файлы не трогаются — в этом смысл двух уровней ключей.
 *  4. Когда скрипт сообщит «осталось 0», убрать v1 из переменной и
 *     перезапустить. Старый ключ после этого можно уничтожить.
 *
 * Идемпотентен и прерываем: каждая запись переобёртывается отдельным
 * UPDATE с проверкой прежнего значения, повторный запуск продолжит с места.
 */
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import {
	isWrappedWithStaleKey,
	unwrapDataKey,
	wrapDataKey,
} from "../src/modules/support-chat/server/crypto.ts";

const payload = await getPayload({ config });
const db = payload.db.drizzle;

type Rows = { rows: { id: number; encryption_key: string }[] };

let rewrapped = 0;
let remaining = 0;

for (const table of ["support_conversations", "support_attachments"] as const) {
	const { rows } = (await db.execute(
		sql`SELECT id, encryption_key FROM ${sql.raw(table)}`,
	)) as unknown as Rows;

	for (const row of rows) {
		if (!isWrappedWithStaleKey(row.encryption_key)) continue;
		const fresh = wrapDataKey(unwrapDataKey(row.encryption_key));
		const updated = (await db.execute(
			sql`UPDATE ${sql.raw(table)} SET encryption_key = ${fresh}
				WHERE id = ${row.id} AND encryption_key = ${row.encryption_key}
				RETURNING id`,
		)) as unknown as Rows;
		if (updated.rows.length > 0) rewrapped++;
		else remaining++;
	}
}

console.log(
	`Переобёрнуто ключей: ${rewrapped}; осталось (изменились по ходу): ${remaining}`,
);
process.exit(0);
