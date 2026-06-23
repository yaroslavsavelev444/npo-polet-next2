import type { Block } from 'payload'

export const LinkBlock: Block = {
  slug: 'link',

  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
    },

    {
      name: 'url',
      type: 'text',
      required: true,
    },
  ],
}