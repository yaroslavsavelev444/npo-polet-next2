import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',

  auth: {
    verify: true,
  },

  admin: {
    useAsTitle: 'email',
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      options: [
        {
          label: 'Пользователь',
          value: 'user',
        },
        {
          label: 'Администратор',
          value: 'admin',
        },
        {
          label: 'Суперадминистратор',
          value: 'superadmin',
        },
      ],
    },

    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        {
          label: 'Активен',
          value: 'active',
        },
        {
          label: 'Заблокирован',
          value: 'blocked',
        },
        {
          label: 'Приостановлен',
          value: 'suspended',
        },
      ],
    },

    {
      name: 'blockedUntil',
      type: 'date',
    },

    {
      name: 'acceptedTerms',
      type: 'checkbox',
      required: true,
    },

    {
      name: 'acceptedTermsVersion',
      type: 'text',
    },

    {
      name: 'acceptedTermsAt',
      type: 'date',
    },

    {
      name: 'lastLoginAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
  ],
}