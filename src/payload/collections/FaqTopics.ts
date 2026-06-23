import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const FaqTopics: CollectionConfig = {
  slug: 'faq-topics',

  admin: {
    useAsTitle: 'title',
    group: 'Контент',
    defaultColumns: ['title', 'order', 'isActive'],
  },

  access: {
    read: () => true,
    create: isAdminOrSuperAdmin,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
  },

  timestamps: true,

  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },

    {
      name: 'description',
      type: 'textarea',
    },

    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      index: true,
    },

    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },

    {
      name: 'questions',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'question',
          type: 'text',
          required: true,
        },

        {
          name: 'answer',
          type: 'textarea',
          required: true,
        },

        {
          name: 'order',
          type: 'number',
          defaultValue: 0,
        },

        {
          name: 'isActive',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}