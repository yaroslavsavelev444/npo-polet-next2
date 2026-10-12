import { sql } from "@payloadcms/db-postgres";
import type { SupportTopic } from "../lib/constants.ts";
import { type Executor, num, query, queryOne } from "./db.ts";

/**
 * Менеджеры чата — весь персонал админки (см. permissions.ts).
 */
export interface AgentRecord {
	adminId: number;
	name: string;
	topics: SupportTopic[];
}

const STAFF = sql`a.role IN ('admin', 'superadmin')`;

export async function listAgents(db: Executor): Promise<AgentRecord[]> {
	const rows = await query(
		db,
		sql`SELECT
				a.id,
				COALESCE(NULLIF(TRIM(a.support_display_name), ''), a.name) AS name,
				COALESCE(
					(SELECT array_agg(t.value::text ORDER BY t."order")
						FROM admins_support_topics t WHERE t.parent_id = a.id),
					'{}'
				) AS topics
			FROM admins a
			WHERE ${STAFF}
			ORDER BY a.id`,
	);
	return rows.map((row) => ({
		adminId: num(row.id),
		name: String(row.name),
		topics: (Array.isArray(row.topics) ? row.topics : []) as SupportTopic[],
	}));
}

/** Получатель передачи диалога; null — такого сотрудника нет. */
export async function findAssignableAdmin(
	db: Executor,
	adminId: number,
): Promise<{ adminId: number; name: string } | null> {
	const row = await queryOne(
		db,
		sql`SELECT a.id, COALESCE(NULLIF(TRIM(a.support_display_name), ''), a.name) AS name
			FROM admins a
			WHERE a.id = ${adminId} AND ${STAFF}`,
	);
	return row ? { adminId: num(row.id), name: String(row.name) } : null;
}
