import { postgresAdapter } from "@payloadcms/db-postgres";
import { ru } from "@payloadcms/translations/languages/ru";
import path from "path";
import { buildConfig } from "payload";
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
  serverURL: process.env.PAYLOAD_SERVER_URL || "http://localhost:3000",
  i18n: {
    supportedLanguages: { ru },
    fallbackLanguage: "ru",
  },
  admin: {
    user: Admins.slug,
  },

  cors: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  csrf: (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),

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
    prodMigrations: migrations,
  }),

  typescript: {
    outputFile: path.resolve(process.cwd(), "payload-types.ts"),
  },
});
