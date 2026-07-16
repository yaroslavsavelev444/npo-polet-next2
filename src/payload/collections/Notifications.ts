import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'
import { ownedByUserOrStaff } from '../access/ownership.ts'

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
    // Владелец видит и помечает прочитанными только свои уведомления,
    // персонал — все. См. ownership.ts.
    //
    // Кастомный роут app/api/notifications/route.ts перекрывает только сам
    // путь /api/notifications — обращение по id (/api/notifications/42)
    // уходит в REST Payload и упирается ровно в этот access. Раньше проверка
    // шла по одному req.user.role, поэтому покупатель с role=superadmin читал
    // и правил чужие уведомления по прямому id.
    read: ownedByUserOrStaff,
    create: isAdminOrSuperAdmin,
    update: ownedByUserOrStaff,
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