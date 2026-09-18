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
    // Белый список, а не чёрный: всё, чего здесь нет, загрузить нельзя.
    // Поэтому в нём нет и не должно быть ничего исполняемого — ни SVG (это
    // документ с активным содержимым: <script> внутри картинки выполняется
    // при открытии файла по прямой ссылке), ни архивов, ни html.
    //
    // Офисные форматы добавлены ради документов на главной (сертификаты,
    // декларации, прайсы, реквизиты): они не исполняются в браузере — он
    // отдаёт их на скачивание. Разрешены и старые бинарные (.doc/.xls), и
    // новые OOXML (.docx/.xlsx): у администратора на руках бывают оба.
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'video/mp4',
      'video/webm',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
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
        { label: 'Hero-фон', value: 'hero' },
        { label: 'Другое', value: 'other' },
      ],
      defaultValue: 'product',
    },
  ],
}