import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'
import { isLoggedIn } from '../access/isLoggedIn.ts'

// ─── Enums (заменены на as const) ──────────────────────────────────────────

export const OrderStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const
export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus]

export const DeliveryMethod = {
  DOOR_TO_DOOR: 'door_to_door',
  PICKUP_POINT: 'pickup_point',
  TRANSPORT_COMPANY: 'transport_company',
} as const
export type DeliveryMethodType = (typeof DeliveryMethod)[keyof typeof DeliveryMethod]

export const PaymentMethod = {
  CARD: 'card',
  CASH: 'cash',
  INVOICE: 'invoice',
  ONLINE: 'online',
} as const
export type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod]

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * beforeOperation hook — генерация orderNumber перед созданием.
 * Аналог Mongoose pre('save') с this.isNew.
 */
const generateOrderNumber = async ({ operation, data, req }: any) => {
  if (operation === 'create' && data && !data.orderNumber) {
    const year = new Date().getFullYear()
    // Считаем заказы за текущий год через Payload Local API
    const { totalDocs } = await req.payload.find({
      collection: 'orders',
      where: {
        createdAt: {
          greater_than: new Date(`${year}-01-01`).toISOString(),
        },
      },
      limit: 0,
    })
    data.orderNumber = `ORD-${year}-${(totalDocs + 1).toString().padStart(6, '0')}`
  }
  return data
}

// ─── Collection ───────────────────────────────────────────────────────────────

export const Orders: CollectionConfig = {
  slug: 'orders',

  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'recipient', 'pricing', 'createdAt'],
    group: 'Магазин',
  },

  access: {
    // Обычный пользователь видит только свои заказы
    read: ({ req }) => {
      if (!req.user) return false
      if (req.user.role === 'admin' || req.user.role === 'superadmin') return true
      return { user: { equals: req.user.id } }
    },
    create: isLoggedIn,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
  },

  hooks: {
    beforeOperation: [generateOrderNumber],
  },

  fields: [
    // ── Идентификатор ────────────────────────────────────────────────────────
    {
      name: 'orderNumber',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Генерируется автоматически',
      },
    },

    // ── Покупатель ───────────────────────────────────────────────────────────
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },

    // ── Статус заказа ────────────────────────────────────────────────────────
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: OrderStatus.PENDING,
      index: true,
      options: [
        { label: 'Ожидает подтверждения', value: OrderStatus.PENDING },
        { label: 'Подтверждён', value: OrderStatus.CONFIRMED },
        { label: 'В обработке', value: OrderStatus.PROCESSING },
        { label: 'Отправлен', value: OrderStatus.SHIPPED },
        { label: 'Доставлен', value: OrderStatus.DELIVERED },
        { label: 'Отменён', value: OrderStatus.CANCELLED },
        { label: 'Возврат', value: OrderStatus.REFUNDED },
      ],
      admin: { position: 'sidebar' },
    },

    // ── Получатель ───────────────────────────────────────────────────────────
    {
      name: 'recipient',
      type: 'group',
      label: 'Получатель',
      fields: [
        {
          name: 'fullName',
          type: 'text',
          required: true,
        },
        {
          name: 'phone',
          type: 'text',
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          required: true,
        },
        {
          name: 'contactPerson',
          type: 'text',
        },
      ],
    },

    // ── Доставка ─────────────────────────────────────────────────────────────
    {
      name: 'delivery',
      type: 'group',
      label: 'Доставка',
      fields: [
        {
          name: 'method',
          type: 'select',
          required: true,
          defaultValue: DeliveryMethod.DOOR_TO_DOOR,
          options: [
            { label: 'Курьер до двери', value: DeliveryMethod.DOOR_TO_DOOR },
            { label: 'Пункт выдачи', value: DeliveryMethod.PICKUP_POINT },
            { label: 'Транспортная компания', value: DeliveryMethod.TRANSPORT_COMPANY },
          ],
        },
        // Адрес доставки (актуально для DOOR_TO_DOOR)
        {
          name: 'address',
          type: 'group',
          label: 'Адрес доставки',
          admin: {
            condition: (_, siblingData) =>
              siblingData?.method === DeliveryMethod.DOOR_TO_DOOR,
          },
          fields: [
            { name: 'street', type: 'text' },
            { name: 'city', type: 'text' },
            { name: 'postalCode', type: 'text' },
            { name: 'country', type: 'text' },
          ],
        },
        // Пункт выдачи (актуально для PICKUP_POINT)
        {
          name: 'pickupPoint',
          type: 'relationship',
          relationTo: 'pickup-points',
          admin: {
            condition: (_, siblingData) =>
              siblingData?.method === DeliveryMethod.PICKUP_POINT,
          },
        },
        // Транспортная компания (актуально для TRANSPORT_COMPANY)
        {
          name: 'transportCompany',
          type: 'relationship',
          relationTo: 'transport-companies',
          admin: {
            condition: (_, siblingData) =>
              siblingData?.method === DeliveryMethod.TRANSPORT_COMPANY,
          },
        },
        { name: 'trackingNumber', type: 'text' },
        { name: 'estimatedDelivery', type: 'date' },
        { name: 'notes', type: 'textarea' },
      ],
    },

    // ── Позиции заказа ───────────────────────────────────────────────────────
    {
      name: 'items',
      type: 'array',
      label: 'Позиции заказа',
      minRows: 1,
      fields: [
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          required: true,
        },
        { name: 'sku', type: 'text' },
        { name: 'name', type: 'text', label: 'Название (снимок)' },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
        },
        {
          name: 'unitPrice',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'discount',
          type: 'number',
          defaultValue: 0,
          min: 0,
        },
        {
          name: 'totalPrice',
          type: 'number',
          required: true,
          min: 0,
        },
        { name: 'weight', type: 'number' },
        {
          name: 'dimensions',
          type: 'group',
          label: 'Габариты',
          fields: [
            { name: 'length', type: 'number' },
            { name: 'width', type: 'number' },
            { name: 'height', type: 'number' },
          ],
        },
      ],
    },

    // ── Ценообразование ──────────────────────────────────────────────────────
    {
      name: 'pricing',
      type: 'group',
      label: 'Стоимость',
      fields: [
        { name: 'subtotal', type: 'number', required: true, min: 0 },
        { name: 'discount', type: 'number', defaultValue: 0, min: 0 },
        { name: 'shippingCost', type: 'number', defaultValue: 0, min: 0 },
        { name: 'tax', type: 'number', defaultValue: 0, min: 0 },
        { name: 'total', type: 'number', required: true, min: 0 },
        {
          name: 'currency',
          type: 'text',
          defaultValue: 'RUB',
          admin: { position: 'sidebar' },
        },
        { name: 'productDiscounts', type: 'number', defaultValue: 0, min: 0 },
        { name: 'centralDiscountAmount', type: 'number', defaultValue: 0, min: 0 },
        { name: 'priceWithoutDiscount', type: 'number', defaultValue: 0, min: 0 },
        {
          name: 'centralDiscountPercent',
          type: 'number',
          defaultValue: 0,
          min: 0,
          max: 100,
        },
      ],
    },

    // ── Оплата ───────────────────────────────────────────────────────────────
    {
      name: 'payment',
      type: 'group',
      label: 'Оплата',
      fields: [
        {
          name: 'method',
          type: 'select',
          required: true,
          options: [
            { label: 'Карта', value: PaymentMethod.CARD },
            { label: 'Наличные', value: PaymentMethod.CASH },
            { label: 'Счёт', value: PaymentMethod.INVOICE },
            { label: 'Онлайн', value: PaymentMethod.ONLINE },
          ],
        },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'pending',
          options: [
            { label: 'Ожидает', value: 'pending' },
            { label: 'Оплачен', value: 'paid' },
            { label: 'Ошибка', value: 'failed' },
            { label: 'Возврат', value: 'refunded' },
          ],
          index: true,
        },
        { name: 'transactionId', type: 'text' },
        { name: 'paidAt', type: 'date' },
        {
          name: 'paymentDetails',
          type: 'json',
          label: 'Детали платежа (raw)',
        },
      ],
    },

    // ── История статусов ─────────────────────────────────────────────────────
    {
      name: 'statusHistory',
      type: 'array',
      label: 'История статусов',
      admin: { readOnly: true },
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          options: Object.values(OrderStatus).map((s) => ({ label: s, value: s })),
        },
        {
          name: 'changedAt',
          type: 'date',
          defaultValue: () => new Date().toISOString(),
        },
        {
          name: 'changedBy',
          type: 'relationship',
          relationTo: 'users',
          required: true,
        },
        { name: 'comment', type: 'text' },
        { name: 'metadata', type: 'json' },
      ],
    },

    // ── Применённые скидки ───────────────────────────────────────────────────
    {
      name: 'appliedDiscounts',
      type: 'array',
      label: 'Применённые скидки',
      fields: [
        {
          name: 'discountId',
          type: 'relationship',
          relationTo: 'discounts',
        },
        { name: 'name', type: 'text' },
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'По количеству', value: 'quantity_based' },
            { label: 'По сумме', value: 'amount_based' },
            { label: 'Процентная', value: 'percentage_based' },
          ],
        },
        { name: 'discountPercent', type: 'number' },
        { name: 'discountAmount', type: 'number' },
        { name: 'condition', type: 'json' },
        {
          name: 'appliedAt',
          type: 'date',
          defaultValue: () => new Date().toISOString(),
        },
      ],
    },

    // ── Отмена ───────────────────────────────────────────────────────────────
    {
      name: 'cancellation',
      type: 'group',
      label: 'Отмена заказа',
      admin: {
        condition: (data) => data?.status === OrderStatus.CANCELLED,
      },
      fields: [
        { name: 'reason', type: 'textarea' },
        { name: 'cancelledBy', type: 'relationship', relationTo: 'users' },
        { name: 'cancelledAt', type: 'date' },
        { name: 'refundAmount', type: 'number' },
        { name: 'notes', type: 'textarea' },
      ],
    },

    // ── Информация о компании ────────────────────────────────────────────────
    {
      name: 'companyInfo',
      type: 'group',
      label: 'Организация',
      fields: [
        { name: 'companyId', type: 'relationship', relationTo: 'companies' },
        { name: 'name', type: 'text' },
        { name: 'address', type: 'text' },
        { name: 'legalAddress', type: 'text' },
        { name: 'taxNumber', type: 'text' },
        { name: 'contactPerson', type: 'text' },
      ],
    },

    // ── companySelection ─────────────────────────────────────────────────────
    {
      name: 'companyCreated',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    {
      name: 'companySelection',
      type: 'group',
      label: 'Выбор организации',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'Существующая', value: 'existing' },
            { label: 'Новая', value: 'new' },
          ],
        },
        { name: 'companyId', type: 'text' },
        { name: 'taxNumber', type: 'text' },
      ],
    },

    // ── Вложения ─────────────────────────────────────────────────────────────
    {
      name: 'attachments',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
      label: 'Вложения',
    },

    // ── Заметки ──────────────────────────────────────────────────────────────
    { name: 'notes', type: 'textarea', label: 'Примечания (для клиента)' },
    {
      name: 'internalNotes',
      type: 'textarea',
      label: 'Внутренние заметки',
      admin: { condition: () => false }, // скрыто от клиентов через access
    },
    {
      name: 'tags',
      type: 'array',
      label: 'Теги',
      fields: [{ name: 'tag', type: 'text' }],
    },

    // ── Мета / источник ──────────────────────────────────────────────────────
    {
      name: 'source',
      type: 'select',
      defaultValue: 'web',
      options: [
        { label: 'Сайт', value: 'web' },
        { label: 'Мобильное', value: 'mobile' },
        { label: 'API', value: 'api' },
        { label: 'Админ', value: 'admin' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'ipAddress', type: 'text', admin: { readOnly: true } },
    { name: 'userAgent', type: 'text', admin: { readOnly: true } },
  ],
}