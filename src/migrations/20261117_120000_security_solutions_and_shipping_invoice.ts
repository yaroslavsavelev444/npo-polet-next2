import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "orders"
			ADD COLUMN "delivery_include_shipping_in_invoice" boolean DEFAULT false;

		CREATE TABLE "security_solutions" (
			"id" serial PRIMARY KEY NOT NULL,
			"updated_at" timestamp(3) with time zone,
			"created_at" timestamp(3) with time zone
		);
		CREATE TABLE "security_solutions_rels" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer,
			"parent_id" integer NOT NULL REFERENCES "security_solutions"("id") ON DELETE cascade,
			"path" varchar NOT NULL,
			"products_id" integer REFERENCES "products"("id") ON DELETE cascade
		);
		CREATE INDEX "security_solutions_rels_order_idx" ON "security_solutions_rels" ("order");
		CREATE INDEX "security_solutions_rels_parent_idx" ON "security_solutions_rels" ("parent_id");
		CREATE INDEX "security_solutions_rels_path_idx" ON "security_solutions_rels" ("path");
		CREATE INDEX "security_solutions_rels_products_id_idx" ON "security_solutions_rels" ("products_id");

		-- Стартовый состав. Дальнейшие изменения сохраняются только через Payload.
		WITH selection AS (
			INSERT INTO "security_solutions" ("created_at", "updated_at")
			VALUES (now(), now()) RETURNING "id"
		)
		INSERT INTO "security_solutions_rels" ("order", "parent_id", "path", "products_id")
		SELECT initial.position, selection.id, 'products', products.id
		FROM selection
		CROSS JOIN (VALUES
			(1, 'ruchnoy-setkomyot-pauk-30-1-snaryad-1-kartridzh'),
			(2, 'ruchnoy-setkomyot-pauk-30b-4-snaryada'),
			(3, 'troynaya-stacionarnaya-ustanovka-provod-5m')
		) AS initial(position, slug)
		JOIN "products" ON products.slug = initial.slug
		WHERE products."_status" = 'published' AND products."inventory_is_visible" = true;
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DROP TABLE "security_solutions_rels";
		DROP TABLE "security_solutions";
		ALTER TABLE "orders" DROP COLUMN "delivery_include_shipping_in_invoice";
	`);
}
