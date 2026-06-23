import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { ru } from '@payloadcms/translations/languages/ru'
import path from 'path'
import { Settings } from './src/payload/globals/Settings.ts'
import { Banners } from './src/payload/collections/Banners.ts'
import { Carts } from './src/payload/collections/Carts.ts'
import { Categories } from './src/payload/collections/Categories.ts'
import { Companies } from './src/payload/collections/Companies.ts'
import { Consents } from './src/payload/collections/Consents.ts'
import { Discounts } from './src/payload/collections/Discounts.ts'
import { Feedbacks } from './src/payload/collections/Feedbacks.ts'
import { Media } from './src/payload/collections/Media.ts'
import { Orders } from './src/payload/collections/Orders.ts'
import PickupPoints from './src/payload/collections/PickupPoint.ts'
import { Products } from './src/payload/collections/Products.ts'
import TransportCompanies from './src/payload/collections/TransportCompanies.ts'
import { Users } from './src/payload/collections/User.ts'
import { KnowledgeTopics } from './src/payload/collections/KnowledgeTopics.ts'
import { Wishlists } from './src/payload/collections/Wishlists.ts'
import { Notifications } from './src/payload/collections/Notifications.ts'
import { ContentBlocks } from './src/payload/collections/ContentBlocks.ts'
import { FaqTopics } from './src/payload/collections/FaqTopics.ts'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,

  i18n: {
    supportedLanguages: { ru },
    fallbackLanguage: 'ru',
  },

  admin: {
    user: Users.slug,
  },
globals: [Settings],
  localization: {
    locales: ['ru', 'en'],
    defaultLocale: 'ru',
  },

  collections: [
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
    FaqTopics
  ],

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI,
    },
  }),

  typescript: {
    outputFile: path.resolve(process.cwd(), 'payload-types.ts'),
  },
  
})