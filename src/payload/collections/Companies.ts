// src/collections/Companies.ts

import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'
import { isLoggedIn } from '../access/isLoggedIn.ts'

export const Companies: CollectionConfig = {
  slug: 'companies',

  admin: {
    useAsTitle: 'companyName',
    defaultColumns: [
      'companyName',
      'taxNumber',
      'contactPerson',
      'createdAt',
    ],
    group: 'Клиенты',
  },

  access: {
    read: ({ req }) => {
      if (!req.user) return false

      if (
        req.user.role === 'admin' ||
        req.user.role === 'superadmin'
      ) {
        return true
      }

      return {
        user: {
          equals: req.user.id,
        },
      }
    },

    create: isLoggedIn,
    update: isLoggedIn,
    delete: isAdminOrSuperAdmin,
  },

  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },

    {
      name: 'companyName',
      type: 'text',
      required: true,
      index: true,
    },

    {
      name: 'legalAddress',
      type: 'textarea',
      required: true,
    },

    {
      name: 'companyAddress',
      type: 'textarea',
    },

    {
      name: 'taxNumber',
      type: 'text',
      required: true,
      index: true,
    },

    {
      name: 'contactPerson',
      type: 'text',
    },

    {
      name: 'phone',
      type: 'text',
    },

    {
      name: 'email',
      type: 'email',
    },
  ],

  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data?.taxNumber) {
          data.taxNumber = data.taxNumber.replace(/\s/g, '')
        }

        return data
      },
    ],
  },

  dbIndexes: [
    {
      fields: {
        taxNumber: 1,
        user: 1,
      },
      options: {
        unique: true,
      },
    },

    {
      fields: {
        companyName: 'text',
        taxNumber: 'text',
      },
    },
  ],
}