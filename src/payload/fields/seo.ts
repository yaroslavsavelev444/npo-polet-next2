import type { Field } from 'payload'

export const seoField: Field = {
  name: 'seo',
  type: 'group',
  label: 'SEO',
  fields: [
    { name: 'title', type: 'text', label: 'Meta Title' },
    { name: 'description', type: 'textarea', label: 'Meta Description' },
    {
      name: 'keywords',
      type: 'textarea',
      label: 'Ключевые слова (через запятую)',
      admin: {
        description: 'Пример: знаки, светофоры, дорожные ограждения',
      },
    },
  ],
}