import  type{ CollectionConfig } from 'payload'

const TransportCompanies: CollectionConfig = {
  slug: 'transport-companies',
  admin: {
    useAsTitle: 'name',
    group: 'Доставка',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'phone',
      type: 'text',
    },
    {
      name: 'website',
      type: 'text',
    },
    {
      name: 'trackingUrlTemplate',
      type: 'text',
      admin: {
        description: 'Шаблон URL для отслеживания, например https://track.ru/{trackingNumber}',
      },
    },
  ],
}

export default TransportCompanies