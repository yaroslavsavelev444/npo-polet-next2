import type { Block } from 'payload'

export const ImageBlock: Block = {
  slug: 'image',

  fields: [
    {
      name: 'image',
      type: 'relationship',
      relationTo: 'media',
      required: true,
    },

    {
      name: 'caption',
      type: 'text',
    },
  ],
}