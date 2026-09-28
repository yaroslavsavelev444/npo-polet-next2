import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { ru } from "@payloadcms/translations/languages/ru";
import path from "path";
import { buildConfig } from "payload";
import sharp from "sharp";
import { env } from "./src/env.ts";
import { migrations } from "./src/migrations/index.ts";
import { AccountDeletionRequests } from "./src/payload/collections/AccountDeletionRequests.ts";
import { ErrorEvents } from "./src/payload/collections/ErrorEvents.ts";
import { Admins } from "./src/payload/collections/Admins.ts";
import { BannerEvents } from "./src/payload/collections/BannerEvents.ts";
import { Banners } from "./src/payload/collections/Banners.ts";
import { BannerStates } from "./src/payload/collections/BannerStates.ts";
import { Carts } from "./src/payload/collections/Carts.ts";
import { CatalogFacets } from "./src/payload/collections/CatalogFacets.ts";
import { Categories } from "./src/payload/collections/Categories.ts";
import { CheckoutPreferences } from "./src/payload/collections/CheckoutPreferences.ts";
import { Companies } from "./src/payload/collections/Companies.ts";
import { Consents } from "./src/payload/collections/Consents.ts";
import { ContactRequests } from "./src/payload/collections/ContactRequests.ts";
import { ContentBlocks } from "./src/payload/collections/ContentBlocks.ts";
import { Discounts } from "./src/payload/collections/Discounts.ts";
import { Faq } from "./src/payload/collections/Faq.ts";
import { Feedbacks } from "./src/payload/collections/Feedbacks.ts";
import { KnowledgeCategories } from "./src/payload/collections/KnowledgeCategories.ts";
import { KnowledgeSections } from "./src/payload/collections/KnowledgeSections.ts";
import { KnowledgeTopics } from "./src/payload/collections/KnowledgeTopics.ts";
import { Media } from "./src/payload/collections/Media.ts";
import { Notifications } from "./src/payload/collections/Notifications.ts";
import { Orders } from "./src/payload/collections/Orders.ts";
import { OtpCodes } from "./src/payload/collections/OtpCodes.ts"; // добавили
import PickupPoints from "./src/payload/collections/PickupPoint.ts";
import { Products } from "./src/payload/collections/Products.ts";
import { PromoCodeRedemptions } from "./src/payload/collections/PromoCodeRedemptions.ts";
import { PromoCodes } from "./src/payload/collections/PromoCodes.ts";
import { RestockSubscriptions } from "./src/payload/collections/RestockSubscriptions.ts";
import { ProductReviews } from "./src/payload/collections/Reviews.ts"; // добавили (если экспортируется как ProductReviews)
import { Sessions } from "./src/payload/collections/Sessions.ts"; // добавили
import TransportCompanies from "./src/payload/collections/TransportCompanies.ts";
import { TrustedDevices } from "./src/payload/collections/TrustedDevices.ts";
import { Users } from "./src/payload/collections/User.ts";
import { UserConsents } from "./src/payload/collections/UserConsents.ts"; // добавили
import { Wishlists } from "./src/payload/collections/Wishlists.ts";
import { projectEmailAdapter } from "./src/payload/email/adapter.ts";
import { AlertingSettings } from "./src/payload/globals/AlertingSettings.ts";
import { Settings } from "./src/payload/globals/Settings.ts";
import { captureAfterError } from "./src/payload/hooks/captureAfterError.ts";

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

	// ⚠ sharp обязателен, а не «улучшение качества картинок».
	//
	// В Media объявлены imageSizes (thumbnail/card/full) и focalPoint, но
	// генерирует их Payload только тем sharp, который передан сюда. Без него он
	// на каждом старте писал в лог
	//
	//   WARN: Image resizing is enabled for one or more collections, but sharp
	//         not installed.
	//
	// и молча не создавал НИ ОДНОГО производного размера: и витрина, и админка
	// отдавали оригинал по 3-4 МБ там, где код просит thumbnail (см.
	// src/modules/search/lib/adapter.ts и build-order-list-view.ts — оба с
	// fallback'ом на media.url, из-за которого поломка и не бросалась в глаза).
	//
	// Уже загруженные файлы задним числом не нарежутся: размеры считаются при
	// загрузке. Новые — будут.
	sharp,

	// Адаптер отправки писем. Подробно, почему он нужен и почему свой, —
	// в src/payload/email/adapter.ts.
	email: projectEmailAdapter,

	// Редактор по умолчанию для полей richText, которые не задали собственный.
	// Обязателен: без него Payload падает на старте при первом же richText-поле.
	// Содержимое статей базы знаний использует свою, расширенную конфигурацию
	// (src/payload/lexical/knowledgeEditor.ts).
	editor: lexicalEditor(),

	globals: [Settings, AlertingSettings],

	// Ошибки 5xx эндпоинтов Payload — в журнал ошибок и письмом дежурному
	// (src/services/observability/README.md).
	hooks: {
		afterError: [captureAfterError],
	},
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
		// Словарь фасетов раздела — необязательная настройка фильтров каталога
		// поверх автоматически нормализованных характеристик.
		CatalogFacets,
		Carts,
		Orders,
		Consents,
		Feedbacks,
		ContactRequests,
		Banners,
		// Состояния и журнал показов — служебные спутники Banners: определение
		// баннера живёт в коллекции выше, а «сколько раз его видел вот этот
		// покупатель» и «что он с ним сделал» обязаны лежать отдельно (см.
		// шапки самих коллекций). В меню админки скрыты.
		BannerStates,
		BannerEvents,
		PickupPoints,
		TransportCompanies,
		Discounts,
		// Промокоды намеренно живут отдельно от Discounts: другая сущность,
		// свой учёт активаций, свои правила (см. src/modules/promo).
		PromoCodes,
		PromoCodeRedemptions,
		Companies,
		KnowledgeCategories,
		KnowledgeSections,
		KnowledgeTopics,
		Faq,
		Wishlists,
		Notifications,
		ContentBlocks,
		OtpCodes, // добавили
		ProductReviews, // добавили
		Sessions, // добавили
		// Доверенные устройства — спутник Sessions: там «где сейчас открыт
		// аккаунт», здесь «какому браузеру разрешено входить без кода». Сроки
		// жизни у них разные, поэтому и коллекции разные (см. шапку).
		TrustedDevices,
		RestockSubscriptions,
		UserConsents, // добавили
		AccountDeletionRequests,
		CheckoutPreferences,
		// Журнал серверных ошибок. Только суперадминистратору; персональные
		// данные — только в карточке записи (см. шапку коллекции).
		ErrorEvents,
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
