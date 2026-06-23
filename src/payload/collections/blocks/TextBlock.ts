import type { Block } from 'payload'
// import { lexicalEditor } from '@payloadcms/richtext-lexical'

export const TextBlock: Block = {
  slug: 'text',

  fields: [
    {
      name: 'content',
      type: 'textarea',
      // editor: lexicalEditor(),
      required: true,
    },
  ],
}