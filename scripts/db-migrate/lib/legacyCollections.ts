// scripts/db-migrate/lib/legacyCollections.ts

// Реальные имена коллекций в старой MongoDB — стандартная плюрализация
// mongoose от имени модели (model("User", ...) -> "users" и т.д.), явных
// переопределений `collection:` в присланных схемах не было. Если хотя бы
// одно имя здесь не совпадёт с реальным - миграция того модуля упадёт на
// самом первом шаге (courtesy-проверка через listCollections, см.
// scripts/db-migrate/run.ts) с понятной ошибкой, а не молча обработает 0
// документов.
export const LEGACY_COLLECTIONS = {
	users: "users",
	carts: "carts",
	categories: "categories",
	companies: "companies",
	consents: "consents",
	discounts: "discounts",
	faqTopics: "faqtopics",
	orders: "orders",
	pickupPoints: "pickuppoints",
	products: "products",
	transportCompanies: "transportcompanies",
	userAcceptedConsents: "useracceptedconsents",
	wishlists: "wishlists",
} as const;
