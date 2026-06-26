import type { CollectionConfig } from 'payload'
import xss from 'xss'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const ContentBlocks: CollectionConfig = {
  slug: 'content-blocks',
  admin: {
    useAsTitle: 'title',
    group: 'Контент',
    defaultColumns: ['title', 'variant', 'position', 'isActive', 'updatedAt'],
    // Скрываем системные поля от редактирования в админке
    listSearchableFields: ['title', 'subtitle'],
  },
  access: {
    read: () => true,
    create: isAdminOrSuperAdmin,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
  },
  timestamps: true, // автоматически создаёт createdAt / updatedAt
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (!data) return data

        // XSS защита
        if (data.title) data.title = xss(data.title)
        if (data.subtitle) data.subtitle = xss(data.subtitle)
        if (data.description) data.description = xss(data.description)
        if (data.button?.text) {
          data.button.text = xss(data.button.text)
        }

        // Нормализация тегов
        if (Array.isArray(data.tags)) {
          data.tags = data.tags
            .filter(Boolean)
            .map((tag: string) => tag.trim().toLowerCase())
        }

        // Автозаполнение createdBy / updatedBy
        if (req?.user?.id) {
          if (!data.createdBy) {
            data.createdBy = req.user.id
          }
          data.updatedBy = req.user.id
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'subtitle',
      type: 'text',
      required: true,
      maxLength: 500,
    },
    {
      name: 'image',
      type: 'relationship',
      relationTo: 'media',
    },

    // === Новая вариация размещения блока ===
    {
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: 'default',
      options: [
        { label: 'Стандартный', value: 'default' },
        { label: 'Слева изображение', value: 'image-left' },
        { label: 'Справа изображение', value: 'image-right' },
        { label: 'Только текст', value: 'text-only' },
        { label: 'Большое изображение', value: 'hero' },
        // Добавляй свои варианты по необходимости
      ],
      admin: {
        position: 'sidebar',
      },
    },

    {
      name: 'button',
      type: 'group',
      fields: [
        {
          name: 'text',
          type: 'text',
          maxLength: 50,
        },
        {
          name: 'action',
          type: 'text',
          validate: (value: string | null | undefined) => {
            if (!value) return true
            const isValid =
              /^(https?:\/\/|\/)[^\s]+$/.test(value) ||
              /^[a-zA-Z0-9_]+$/.test(value)
            return isValid || 'Некорректный формат действия кнопки'
          },
        },
        {
          name: 'style',
          type: 'select',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Outline', value: 'outline' },
          ],
        },
      ],
    },

    {
      name: 'description',
      type: 'textarea',
      maxLength: 2000,
    },

    {
      name: 'position',
      type: 'number',
      defaultValue: 0,
      min: 0,
      index: true,
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },

    {
      name: 'tags',
      type: 'array',
      fields: [
        {
          name: 'tag',
          type: 'text',
        },
      ],
    },

    {
      name: 'metadata',
      type: 'json',
    },

    // Системные поля — скрыты в админке
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'updatedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}