// scripts/db-migrate/lib/legacyCollections.ts

// Реальные имена коллекций в старой MongoDB — стандартная плюрализация
// mongoose от имени модели (model("User", ...) -> "users" и т.д.), явных
// переопределений `collection:` в присланных схемах не было.
//
// Если хотя бы одно имя здесь не совпадёт с реальным, весь прогон падает на
// самом первом шаге с понятной ошибкой — см. assertLegacyCollectionsExist в
// scripts/db-migrate/run.ts. Проверка обязательна: Mongo по несуществующей
// коллекции молча отдаёт пустой курсор, и без неё опечатка выглядела бы как
// успешный прогон с «0 документов» и бодрым «✅ Без ошибок».
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
