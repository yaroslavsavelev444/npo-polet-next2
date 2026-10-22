/**
 * Печатает последний неиспользованный код подтверждения для почты — E2E
 * проходит экраны кода до конца, не читая писем (EMAIL_ENABLED=false).
 *
 *   node --experimental-strip-types scripts/e2e-otp-code.ts <email> <type>
 *
 * В базе лежит только хеш sha256(PAYLOAD_SECRET:userId:code)
 * (src/modules/auth/lib/otp.ts); шесть цифр перебираются за доли секунды.
 * Работает лишь потому, что локальный PAYLOAD_SECRET известен, — на проде
 * секрет другой, и в этом смысл «перца».
 */
import { createHash } from "node:crypto";
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../payload.config.ts";

if (process.env.NODE_ENV === "production") {
	console.error("Только для локальной базы.");
	process.exit(1);
}

const [email, type] = process.argv.slice(2);
if (!email || !type) throw new Error("Укажите почту и тип кода");

const secret = process.env.PAYLOAD_SECRET;
if (!secret) throw new Error("Нет PAYLOAD_SECRET");

const payload = await getPayload({ config });
const result = (await payload.db.drizzle.execute(sql`
	SELECT o.user_id, o.code_hash FROM otp_codes o
	JOIN users u ON u.id = o.user_id
	WHERE lower(u.email) = lower(${email}) AND o.type = ${type}
	ORDER BY o.created_at DESC LIMIT 1
`)) as { rows: { user_id: number; code_hash: string }[] };
const row = result.rows[0];
if (!row) throw new Error(`Нет кода ${type} для ${email}`);

for (let i = 0; i < 1_000_000; i++) {
	const code = String(i).padStart(6, "0");
	const hash = createHash("sha256")
		.update(`${secret}:${row.user_id}:${code}`)
		.digest("hex");
	if (hash === row.code_hash) {
		// Единственная строка в stdout — тест берёт последнюю.
		console.log(code);
		process.exit(0);
	}
}
throw new Error("Код не подобран");
