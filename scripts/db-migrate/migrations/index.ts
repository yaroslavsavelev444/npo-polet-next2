// scripts/db-migrate/migrations/index.ts
// Порядок в массиве не важен — раннер сортирует по dependsOn (см. core/runner.ts).
import carts from "./carts.migration.ts";
import categories from "./categories.migration.ts";
import companies from "./companies.migration.ts";
import consents from "./consents.migration.ts";
import discounts from "./discounts.migration.ts";
import faq from "./faq.migration.ts";
import orders from "./orders.migration.ts";
import pickupPoints from "./pickupPoints.migration.ts";
import products from "./products.migration.ts";
import transportCompanies from "./transportCompanies.migration.ts";
import userConsents from "./userConsents.migration.ts";
import users from "./users.migration.ts";
import wishlists from "./wishlists.migration.ts";

export const allMigrations = [
	users,
	categories,
	pickupPoints,
	transportCompanies,
	consents,
	faq,
	products,
	companies,
	discounts,
	userConsents,
	carts,
	wishlists,
	orders,
];
