import { type MigrateDownArgs, type MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		CREATE TABLE checkout_order_attempts (
			user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			attempt_id uuid NOT NULL,
			order_id integer REFERENCES orders(id) ON DELETE SET NULL,
			receipt jsonb,
			PRIMARY KEY (user_id, attempt_id)
		);
		CREATE INDEX checkout_order_attempts_order_id_idx ON checkout_order_attempts (order_id);
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`DROP TABLE checkout_order_attempts;`);
}
