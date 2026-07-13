import { postgresAdapter } from "@payloadcms/db-postgres";
import { ru } from "@payloadcms/translations/languages/ru";
import path from "path";
import { buildConfig } from "payload";
import { env } from "./src/env.ts";
import { migrations } from "./src/migrations/index.ts";
import { AccountDeletionRequests } from "./src/payload/collections/AccountDeletionRequests.ts";
import { Admins } from "./src/payload/collections/Admins.ts";
import { Banners } from "./src/payload/collections/Banners.ts";
import { Carts } from "./src/payload/collections/Carts.ts";
import { Categories } from "./src/payload/collections/Categories.ts";
import { CheckoutPreferences } from "./src/payload/collections/CheckoutPreferences.ts";
import { Companies } from "./src/payload/collections/Companies.ts";
import { Consents } from "./src/payload/collections/Consents.ts";
import { ContentBlocks } from "./src/payload/collections/ContentBlocks.ts";
import { Discounts } from "./src/payload/collections/Discounts.ts";
import { Faq } from "./src/payload/collections/Faq.ts";
import { Feedbacks } from "./src/payload/collections/Feedbacks.ts";
import { KnowledgeTopics } from "./src/payload/collections/KnowledgeTopics.ts";
import { Media } from "./src/payload/collections/Media.ts";
import { Notifications } from "./src/payload/collections/Notifications.ts";
import { Orders } from "./src/payload/collections/Orders.ts";
import { OtpCodes } from "./src/payload/collections/OtpCodes.ts"; // добавили
import PickupPoints from "./src/payload/collections/PickupPoint.ts";
import { Products } from "./src/payload/collections/Products.ts";
import { ProductReviews } from "./src/payload/collections/Reviews.ts"; // добавили (если экспортируется как ProductReviews)
import { Sessions } from "./src/payload/collections/Sessions.ts"; // добавили
import TransportCompanies from "./src/payload/collections/TransportCompanies.ts";
import { Users } from "./src/payload/collections/User.ts";
import { UserConsents } from "./src/payload/collections/UserConsents.ts"; // добавили
import { Wishlists } from "./src/payload/collections/Wishlists.ts";
import { Settings } from "./src/payload/globals/Settings.ts";

export default buildConfig({
	secret: process.env.PAYLOAD_SECRET!,
	// Критично: абсолютные URL медиа (Setting.logo.url и т.д.) строятся
	// Payload'ом из этого значения. Хардкод "localhost:3000" ломал бы
	// абсолютные ссылки на медиа в проде (см. NEXT_PUBLIC_APP_URL в .env.production).
	serverURL: env.NEXT_PUBLIC_APP_URL,
	i18n: {
		supportedLanguages: { ru },
		fallbackLanguage: "ru",
	},
	admin: {
		user: Admins.slug,
	},

	// ALLOWED_ORIGINS теперь проходит через src/env.ts: там же на старте
	// процесса проверяется, что при заданном ADMIN_HOSTNAME соответствующий
	// https-origin обязательно в этом списке (иначе Payload будет молча
	// отклонять JWT из cookie для запросов с админки — 403/400, см. env.ts).
	cors: env.ALLOWED_ORIGINS.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean),
	csrf: env.ALLOWED_ORIGINS.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean),

	globals: [Settings],
	localization: {
		locales: ["ru", "en"],
		defaultLocale: "ru",
	},

	collections: [
		Admins,
		Users,
		Media,
		Categories,
		Products,
		Carts,
		Orders,
		Consents,
		Feedbacks,
		Banners,
		PickupPoints,
		TransportCompanies,
		Discounts,
		Companies,
		KnowledgeTopics,
		Faq,
		Wishlists,
		Notifications,
		ContentBlocks,
		OtpCodes, // добавили
		ProductReviews, // добавили
		Sessions, // добавили
		UserConsents, // добавили
		AccountDeletionRequests,
		CheckoutPreferences,
	],

	db: postgresAdapter({
		pool: {
			connectionString: process.env.DATABASE_URI,
		},
		push: false,
		prodMigrations: migrations,
	}),

	typescript: {
		outputFile: path.resolve(process.cwd(), "payload-types.ts"),
	},
});
