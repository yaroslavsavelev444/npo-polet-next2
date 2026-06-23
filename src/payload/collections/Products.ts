import type { CollectionConfig } from 'payload'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'sku', 'status', 'category', 'priceForIndividual'],
  },
  versions: {
    drafts: true,
  },
  access: {
    read: () => true,
    create: isAdminOrSuperAdmin,
    update: isAdminOrSuperAdmin,
    delete: isAdminOrSuperAdmin,
  },
  fields: [
    {
      name: 'sku',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      localized: true,
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
    },
    {
      name: 'images',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
      label: 'Изображения товара',
    },
    {
      name: 'priceForIndividual',
      type: 'number',
      required: true,
      min: 0,
      label: 'Цена для физ. лиц',
    },
    {
      name: 'discount',
      type: 'group',
      fields: [
        { name: 'isActive', type: 'checkbox', defaultValue: false },
        { name: 'percentage', type: 'number', min: 0, max: 100, defaultValue: 0 },
        { name: 'amount', type: 'number', min: 0, defaultValue: 0 },
        { name: 'validFrom', type: 'date' },
        { name: 'validUntil', type: 'date' },
        { name: 'minQuantity', type: 'number', defaultValue: 1, min: 1 },
      ],
    },
    {
  name: 'status',
  type: 'select',
  options: [
    { label: 'Доступен', value: 'available' },
    { label: 'Предзаказ', value: 'preorder' },
    { label: 'Нет в наличии', value: 'out_of_stock' },
    { label: 'Снят с производства', value: 'discontinued' },
  ],
  defaultValue: 'available',
  enumName: 'product_status_enum', 
  admin: {
    position: 'sidebar',
  },
},

    {
      name: 'minOrderQuantity',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 1000,
    },
    {
      name: 'maxOrderQuantity',
      type: 'number',
      min: 1,
      max: 10000,
      validate: (value: number, { siblingData }: any) => {
        if (value && siblingData?.minOrderQuantity && value < siblingData.minOrderQuantity) {
          return 'Максимальное количество должно быть больше или равно минимальному'
        }
        return true
      },
    },
    {
      name: 'isVisible',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'showOnMainPage',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    // Инструкция – разделяем на тип и условные поля
   {
  name: 'instructionType',
  type: 'select',
  options: [
    { label: 'Файл', value: 'file' },
    { label: 'Ссылка', value: 'link' },
  ],
  enumName: 'instruction_type_enum', // 👈 явное имя
  admin: {
    position: 'sidebar',
  },
},

    {
      name: 'instructionFile',
      type: 'relationship',
      relationTo: 'media',
      label: 'Файл инструкции',
      admin: {
        condition: (data, siblingData) => siblingData?.instructionType === 'file',
      },
    },
    {
      name: 'instructionLink',
      type: 'text',
      label: 'Ссылка на инструкцию',
      admin: {
        condition: (data, siblingData) => siblingData?.instructionType === 'link',
      },
      validate: (value: string) => {
        if (value && !/^https?:\/\//.test(value)) {
          return 'Введите корректный URL (начинается с http:// или https://)'
        }
        return true
      },
    },
    // Спецификации
    {
      name: 'specifications',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'unit', type: 'text' },
        { name: 'group', type: 'text' },
        { name: 'isVisible', type: 'checkbox', defaultValue: true },
      ],
    },
    // Связи
    {
      name: 'relatedProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
    {
      name: 'upsellProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
    {
      name: 'crossSellProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
    {
      name: 'manufacturer',
      type: 'text',
    },
    {
      name: 'warrantyMonths',
      type: 'number',
      min: 0,
      max: 120,
    },
    {
      name: 'weight',
      type: 'number',
      min: 0,
    },
    {
      name: 'dimensions',
      type: 'group',
      fields: [
        { name: 'length', type: 'number', min: 0 },
        { name: 'width', type: 'number', min: 0 },
        { name: 'height', type: 'number', min: 0 },
      ],
    },
    {
      name: 'metaTitle',
      type: 'text',
      localized: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'metaDescription',
      type: 'textarea',
      localized: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'keywords',
      type: 'array',
      fields: [{ name: 'keyword', type: 'text' }],
      admin: { position: 'sidebar' },
    },
    {
      name: 'viewsCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'purchasesCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    // Виртуальное поле для финальной цены (вычисляется на сервере)
    {
      name: 'finalPrice',
      type: 'number',
      virtual: true,
      hooks: {
        afterRead: [({ data }) => calculateFinalPrice(data)],
      },
      admin: {
        readOnly: true,
      },
    },
  ],
}

// Функция вычисления финальной цены (используется в виртуальном поле)
function calculateFinalPrice(product: any): number {
  if (!product) return 0
  const price = product.priceForIndividual || 0
  const discount = product.discount
  if (!discount?.isActive) return price

  const now = new Date()
  if (discount.validFrom && new Date(discount.validFrom) > now) return price
  if (discount.validUntil && new Date(discount.validUntil) < now) return price

  let final = price
  if (discount.percentage && discount.percentage > 0) {
    final = final * (1 - discount.percentage / 100)
  }
  if (discount.amount && discount.amount > 0) {
    final = Math.max(0, final - discount.amount)
  }
  return Math.round(final * 100) / 100
}