import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    staticDir: 'media',
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, crop: 'center' },
      { name: 'card', width: 768, height: 576 },
      { name: 'full', width: 1920, height: 1080 },
    ],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
  access: {
    read: () => true, // публичный доступ на чтение
    create: isAdminOrSuperAdmin,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt-текст (SEO)',
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Подпись к файлу',
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      defaultValue: true,
      label: 'Доступен публично',
    },
    {
      name: 'type',
      type: 'select',
      options: [
        { label: 'Сертификат', value: 'certificate' },
        { label: 'Инструкция', value: 'instruction' },
        { label: 'Лицензия', value: 'license' },
        { label: 'Паспорт', value: 'passport' },
        { label: 'Изображение товара', value: 'product' },
        { label: 'Другое', value: 'other' },
      ],
      defaultValue: 'product',
    },
  ],
}