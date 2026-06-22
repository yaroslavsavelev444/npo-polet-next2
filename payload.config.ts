import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { ru } from '@payloadcms/translations/languages/ru'

import { Users } from './src/collections/User'
import { Media } from '@/collections/Media'
import { Categories } from '@/collections/Categories'
import { Products } from '@/collections/Products'

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET!,

  i18n: {
    supportedLanguages: { ru },
    fallbackLanguage: 'ru',
  },

  admin: {
    user: Users.slug,
  },

  localization: {
    locales: ['ru', 'en'],
    defaultLocale: 'ru',
  },

  collections: [
    Users,
    Media,
    Categories,
    Products,
  ],

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI,
    },
  }),
})