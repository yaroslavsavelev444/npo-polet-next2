import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const OtpCodes: CollectionConfig = {
  slug: 'otp-codes',

  admin: {
    // Скрыта из панели — управляется только через Local API
    hidden: true,
  },

  access: {
    // Никто не читает через REST — только Local API на сервере
    read: isAdminOrSuperAdmin,
    create: () => false,
    update: () => false,
    delete: isAdminOrSuperAdmin,
  },

  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      label: 'Пользователь',
    },
    {
      // login_2fa — второй фактор при входе
      // email_verify — подтверждение email при регистрации
      name: 'type',
      type: 'select',
      required: true,
      index: true,
      label: 'Тип',
      options: [
        { label: 'Email верификация', value: 'email_verify' },
        { label: 'Login 2FA', value: 'login_2fa' },
      ],
    },
    {
      // Хранится только SHA-256 хеш кода — сам код нигде не персистируется
      name: 'codeHash',
      type: 'text',
      required: true,
      label: 'Хеш кода (SHA-256)',
      admin: { readOnly: true },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
      label: 'Истекает в',
    },
    {
      // Счётчик неверных попыток — защита от перебора
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      label: 'Попыток',
      admin: { readOnly: true },
    },
    {
      name: 'maxAttempts',
      type: 'number',
      defaultValue: 5,
      label: 'Максимум попыток',
    },
    {
      // После использования или исчерпания попыток — true
      name: 'used',
      type: 'checkbox',
      defaultValue: false,
      label: 'Использован',
      admin: { readOnly: true },
    },
    {
      // IP-адрес для аудита
      name: 'ip',
      type: 'text',
      label: 'IP адрес',
      admin: { readOnly: true },
    },
  ],
}