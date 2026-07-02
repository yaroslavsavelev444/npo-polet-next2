import type { CollectionConfig } from 'payload'
import { generateSlug } from '../utils/generateSlug.ts'
import { isAdminOrSuperAdmin } from '../access/isAdminOrSuperAdmin.ts'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'priceForIndividual', 'status'],
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
    // ─── Основная информация ───────────────────────────────────────────────
    {
      type: 'row',
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          localized: true,
        },
        {
          name: 'slug',
          type: 'text',
          unique: true,
          index: true,
          hooks: {
            beforeValidate: [generateSlug],
          },
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'Автоматически генерируется из названия при создании',
          },
        },
      ],
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

    // ─── Медиа ──────────────────────────────────────────────────────────────
    {
      name: 'images',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
      label: 'Изображения товара',
    },

    // ─── Цена и скидки ─────────────────────────────────────────────────────
    {
      type: 'group',
      name: 'pricing',
      label: 'Цена и скидки',
      fields: [
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
          label: 'Скидка',
          fields: [
            {
              name: 'isActive',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'type',
              type: 'select',
              options: [
                { label: 'Процент', value: 'percentage' },
                { label: 'Фиксированная сумма', value: 'fixed' },
              ],
              defaultValue: 'percentage',
            },
            {
              name: 'value',
              type: 'number',
              min: 0,
              label: 'Значение скидки',
            },
            {
              name: 'validFrom',
              type: 'date',
            },
            {
              name: 'validUntil',
              type: 'date',
            },
            {
              name: 'minQuantity',
              type: 'number',
              defaultValue: 1,
              min: 1,
            },
          ],
        },
      ],
    },

    // ─── Остатки и статусы ─────────────────────────────────────────────────
    {
      type: 'group',
      name: 'inventory',
      label: 'Склад и статусы',
      fields: [
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
          validate: (value : any, { siblingData }: { siblingData: any }) => {
            if (value !== undefined && siblingData?.minOrderQuantity !== undefined && value < siblingData.minOrderQuantity) {
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
      ],
    },

    // ─── Инструкция ────────────────────────────────────────────────────────
    {
      name: 'instruction',
      type: 'group',
      label: 'Инструкция',
      fields: [
        {
          name: 'type',
          type: 'select',
          options: [
            { label: 'Файл', value: 'file' },
            { label: 'Ссылка', value: 'link' },
          ],
          enumName: 'instruction_type_enum',
        },
        {
          name: 'file',
          type: 'relationship',
          relationTo: 'media',
          label: 'Файл инструкции',
          admin: {
            condition: (_, siblingData) => siblingData?.type === 'file',
          },
        },
        {
          name: 'link',
          type: 'text',
          label: 'Ссылка на инструкцию',
          admin: {
            condition: (_, siblingData) => siblingData?.type === 'link',
          },
          validate: (value: any) => {
            if (value && !/^https?:\/\//.test(value)) {
              return 'Введите корректный URL (начинается с http:// или https://)'
            }
            return true
          },
        },
      ],
    },

    // ─── Характеристики ────────────────────────────────────────────────────
    {
      name: 'specifications',
      type: 'array',
      label: 'Характеристики',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'unit', type: 'text' },
        { name: 'group', type: 'text' },
        { name: 'isVisible', type: 'checkbox', defaultValue: true },
      ],
    },

    // ─── Связи ─────────────────────────────────────────────────────────────
    {
      type: 'group',
      name: 'relations',
      label: 'Связанные товары',
      fields: [
        {
          name: 'upsellProducts',
          type: 'relationship',
          relationTo: 'products',
          hasMany: true,
          label: 'Товары для апсейла',
        },
      ],
    },

    // ─── Производитель и гарантия ─────────────────────────────────────────
    {
      type: 'group',
      name: 'brand',
      label: 'Бренд и гарантия',
      fields: [
        {

    name:'manufacturer',

    type:'text'

},
        {
          name: 'warrantyMonths',
          type: 'number',
          min: 0,
          max: 120,
          label: 'Гарантия (месяцев)',
        },
      ],
    },

    // ─── Габариты и вес ────────────────────────────────────────────────────
    {
      name: 'dimensions',
      type: 'group',
      label: 'Габариты и вес',
      fields: [
        { name: 'weight', type: 'number', min: 0, label: 'Вес (кг)' },
        { name: 'length', type: 'number', min: 0, label: 'Длина (см)' },
        { name: 'width', type: 'number', min: 0, label: 'Ширина (см)' },
        { name: 'height', type: 'number', min: 0, label: 'Высота (см)' },
      ],
    },

    // ─── SEO ───────────────────────────────────────────────────────────────
    {
      type: 'group',
      name: 'seo',
      label: 'SEO',
      admin: {
        position: 'sidebar',
      },
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
          localized: true,
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          localized: true,
        },
        {
          name: 'keywords',
          type: 'array',
          fields: [{ name: 'keyword', type: 'text' }],
        },
      ],
    },

    // ─── Аналитика ─────────────────────────────────────────────────────────
    {
      type: 'group',
      name: 'analytics',
      label: 'Аналитика',
      admin: {
        readOnly: true,
      },
      fields: [
        {
          name: 'viewsCount',
          type: 'number',
          defaultValue: 0,
        },
        {
          name: 'purchasesCount',
          type: 'number',
          defaultValue: 0,
        },
      ],
    },
  ],
}