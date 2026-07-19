import * as migration_20260708_081550_initial from "./20260708_081550_initial.ts";
import * as migration_20260710_085725 from "./20260710_085725.ts";
import * as migration_20260710_100518_drop_legacy_audit_columns from "./20260710_100518_drop_legacy_audit_columns.ts";
import * as migration_20260710_100650_drop_legacy_audit_columns from "./20260710_100650_drop_legacy_audit_columns.ts";
import * as migration_20260710_120000_account_deletion_requests from "./20260710_120000_account_deletion_requests.ts";
import * as migration_20260713_080049_hero_background from "./20260713_080049_hero_background.ts";
import * as migration_20260713_093858_legacy_data_migration_support from "./20260713_093858_legacy_data_migration_support.ts";
import * as migration_20260714_115946_legacy_password_migrated_flag from "./20260714_115946_legacy_password_migrated_flag.ts";
import * as migration_20260717_121326_add_products_previous_slugs from "./20260717_121326_add_products_previous_slugs.ts";
import * as migration_20260717_170000_feedback_simplify from "./20260717_170000_feedback_simplify.ts";
import * as migration_20260719_120000_auth_images from "./20260719_120000_auth_images.ts";
import * as migration_20260719_140000_order_address_house_apartment from "./20260719_140000_order_address_house_apartment.ts";

export const migrations = [
	{
		up: migration_20260708_081550_initial.up,
		down: migration_20260708_081550_initial.down,
		name: "20260708_081550_initial",
	},
	{
		up: migration_20260710_085725.up,
		down: migration_20260710_085725.down,
		name: "20260710_085725",
	},
	{
		up: migration_20260710_100518_drop_legacy_audit_columns.up,
		down: migration_20260710_100518_drop_legacy_audit_columns.down,
		name: "20260710_100518_drop_legacy_audit_columns",
	},
	{
		up: migration_20260710_100650_drop_legacy_audit_columns.up,
		down: migration_20260710_100650_drop_legacy_audit_columns.down,
		name: "20260710_100650_drop_legacy_audit_columns",
	},
	{
		up: migration_20260710_120000_account_deletion_requests.up,
		down: migration_20260710_120000_account_deletion_requests.down,
		name: "20260710_120000_account_deletion_requests",
	},
	{
		up: migration_20260713_080049_hero_background.up,
		down: migration_20260713_080049_hero_background.down,
		name: "20260713_080049_hero_background",
	},
	{
		up: migration_20260713_093858_legacy_data_migration_support.up,
		down: migration_20260713_093858_legacy_data_migration_support.down,
		name: "20260713_093858_legacy_data_migration_support",
	},
	{
		up: migration_20260714_115946_legacy_password_migrated_flag.up,
		down: migration_20260714_115946_legacy_password_migrated_flag.down,
		name: "20260714_115946_legacy_password_migrated_flag",
	},
	{
		up: migration_20260717_121326_add_products_previous_slugs.up,
		down: migration_20260717_121326_add_products_previous_slugs.down,
		name: "20260717_121326_add_products_previous_slugs",
	},
	{
		up: migration_20260717_170000_feedback_simplify.up,
		down: migration_20260717_170000_feedback_simplify.down,
		name: "20260717_170000_feedback_simplify",
	},
	{
		up: migration_20260719_120000_auth_images.up,
		down: migration_20260719_120000_auth_images.down,
		name: "20260719_120000_auth_images",
	},
	{
		up: migration_20260719_140000_order_address_house_apartment.up,
		down: migration_20260719_140000_order_address_house_apartment.down,
		name: "20260719_140000_order_address_house_apartment",
	},
];
