import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

/**
 * Коллекция сессий пользователей.
 *
 * Зачем нужна при наличии Payload JWT?
 * - JWT нельзя отозвать до истечения. Сессия — можно.
 * - Показываем пользователю список активных устройств.
 * - Пользователь может завершить отдельную сессию или все сразу.
 * - Полноценный аудит входов.
 *
 * Связь с Payload JWT:
 * - При login создаём сессию, ID сессии кладём в кастомный claim JWT (через afterLogin hook).
 * - Middleware проверяет: JWT валиден + сессия существует и не revoked.
 * - При logout — помечаем сессию revoked, JWT истечёт сам по TTL.
 */
export const Sessions: CollectionConfig = {
  slug: 'sessions',

  admin: {
    group: 'Пользователи',
    useAsTitle: 'id',
    defaultColumns: ['user', 'ip', 'createdAt', 'lastActiveAt', 'revoked'],
    description: 'Активные и завершённые сессии пользователей',
  },

  access: {
    read: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin' || req.user.role === 'superadmin') return true
      // Пользователь видит только свои сессии
      return { user: { equals: req.user.id } }
    },
    create: () => false, // Только через Local API
    update: () => false, // Только через Local API
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
      name: 'userAgent',
      type: 'text',
      label: 'User Agent',
      admin: { readOnly: true },
    },
    {
      name: 'ip',
      type: 'text',
      label: 'IP адрес',
      admin: { readOnly: true },
    },
    {
      // Примерное устройство для отображения пользователю
      name: 'deviceLabel',
      type: 'text',
      label: 'Устройство',
      admin: { readOnly: true },
    },
    {
      name: 'createdAt',
      type: 'date',
      required: true,
      label: 'Создана',
      admin: { readOnly: true },
    },
    {
      name: 'lastActiveAt',
      type: 'date',
      required: true,
      label: 'Последняя активность',
      admin: { readOnly: true },
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
      label: 'Истекает',
      admin: { readOnly: true },
    },
    {
      // Если true — сессия отозвана, middleware не пустит
      name: 'revoked',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: 'Отозвана',
    },
    {
      // Причина отзыва для аудита
      name: 'revokedReason',
      type: 'select',
      label: 'Причина отзыва',
      options: [
        { label: 'Выход пользователя', value: 'logout' },
        { label: 'Выход со всех устройств', value: 'logout_all' },
        { label: 'Смена пароля', value: 'password_changed' },
        { label: 'Административный', value: 'admin' },
      ],
    },
  ],
}