import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const Notifications: CollectionConfig = {
  slug: 'notifications',

  admin: {
    useAsTitle: 'title',
    group: 'Система',
    defaultColumns: [
      'title',
      'user',
      'type',
      'isRead',
      'pushStatus',
      'createdAt',
    ],
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

    create: isAdminOrSuperAdmin,
    // `isLoggedIn` раньше пускало ЛЮБОГО авторизованного пользователя
    // патчить чужие уведомления (PATCH /api/notifications/:id без проверки
    // владельца) — латентная дыра, безвредная пока коллекция не была
    // подключена ни к какому клиенту. Теперь бэлл в шапке дергает её
    // напрямую, так что сужаем update до владельца записи, по аналогии с read.
    update: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        return true
      }
      return { user: { equals: req.user.id } }
    },
    delete: isAdminOrSuperAdmin,
  },

  timestamps: true,

  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },

    {
      name: 'type',
      type: 'select',
      defaultValue: 'system',
      options: [
        'system',
        'subscription_match',
        'chat',
        'review',
        'order',
        'promotion',
        'discount',
        'product',
        'login_from_new_device',
        // Добавлено для системы уведомлений (см. notificationCenter.ts):
        // security — вход/пароль/блокировка по попыткам, account — действия
        // администратора и изменения профиля.
        'security',
        'account',
      ],
      index: true,
    },

    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 200,
    },

    {
      name: 'body',
      type: 'textarea',
      required: true,
    },

    {
      name: 'data',
      type: 'json',
    },

    {
      name: 'link',
      type: 'text',
    },

    {
      name: 'isRead',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },

    {
      name: 'readAt',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },

    {
      name: 'pushStatus',
      type: 'select',
      defaultValue: 'pending',
      options: [
        'pending',
        'sent',
        'failed',
      ],
    },
  ],

  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (
          data?.isRead &&
          !originalDoc?.isRead
        ) {
          data.readAt = new Date().toISOString()
        }

        return data
      },
    ],
  },
}