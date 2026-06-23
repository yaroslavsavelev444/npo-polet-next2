import type { Block } from 'payload'

export const HeadingBlock: Block = {
  slug: 'heading',

  fields: [
    {
      name: 'text',
      type: 'text',
      required: true,
    },
  ],
}